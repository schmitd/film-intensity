import Toybox.Application;
import Toybox.Lang;
import Toybox.Sensor;
import Toybox.SensorHistory;
import Toybox.System;
import Toybox.Time;
import Toybox.Timer;
import Toybox.WatchUi;

class SessionManager {
    hidden static var _instance;

    hidden var _phase = "IDLE";
    hidden var _filmTitle = "Ready to pair";
    hidden var _runtimeMinutes = 0;
    hidden var _elapsedSeconds = 0;
    hidden var _heartRate = null;
    hidden var _stress = null;
    hidden var _hrv = null;
    hidden var _intensity = 0;
    hidden var _uploadNote = "Enter watch code on web";
    hidden var _ticker;
    hidden var _buffer;
    hidden var _api;
    hidden var _settings;
    hidden var _capabilities;
    hidden var _pairCode = "";
    hidden var _deviceId;
    hidden var _deviceModel;
    hidden var _deviceToken = null;
    hidden var _sessionId = null;
    hidden var _latestIntervals = [];
    hidden var _pendingBatch = null;
    hidden var _completionRequested = false;
    hidden var _requestInFlight = false;
    hidden var _nextUploadAttemptAt = 0;
    hidden var _uploadRetryCooldownSeconds = 60;
    hidden var _sessionIdKey = "activeSessionId";
    hidden var _filmTitleKey = "activeFilmTitle";
    hidden var _runtimeMinutesKey = "activeRuntimeMinutes";
    hidden var _elapsedSecondsKey = "activeElapsedSeconds";
    hidden var _completionRequestedKey = "completionRequested";

    static function getInstance() {
        if (_instance == null) {
            _instance = new SessionManager();
        }

        return _instance;
    }

    function initialize() {
        _settings = new FilmIntensitySettings();
        _pairCode = _settings.getPairCode();
        _deviceToken = _settings.getDeviceToken();
        _deviceId = _settings.getDeviceId();
        _deviceModel = _settings.getDeviceModel();
        _buffer = new FilmIntensitySampleBuffer();
        _api = new FilmIntensitySessionApi(_settings.getApiBaseUrl());
        _capabilities = {
            :heartRate => true,
            :stress => supportsStressHistory(),
            :hrv => Sensor has :registerSensorDataListener
        };
        restoreUploadState();
    }

    function startTicker() as Void {
        if (_ticker == null) {
            _ticker = new Timer.Timer();
            _ticker.start(method(:onTick), 5000, true);
        }
    }

    function stopTicker() as Void {
        if (_ticker != null) {
            _ticker.stop();
            _ticker = null;
        }
    }

    function advanceAction() as Void {
        if (_phase == "IDLE") {
            primeSession();
            return;
        }

        if (_phase == "PRIMED") {
            beginRecording();
            return;
        }

        if (_phase == "RECORDING") {
            finishRecording();
            return;
        }

        if (_phase == "UPLOADING") {
            _uploadNote = "Uploads automatically";
            WatchUi.requestUpdate();
            return;
        }

        resetSession();
    }

    function beginPairCodeEdit() as Void {
        if (_phase == "RECORDING" || _phase == "UPLOADING") {
            _uploadNote = "Stop recording before editing";
            WatchUi.requestUpdate();
            return;
        }

        WatchUi.pushView(
            new WatchUi.TextPicker(_pairCode),
            new FilmIntensityPairCodeDelegate(self),
            WatchUi.SLIDE_UP
        );
    }

    function setPairCode(pairCode as String) as Void {
        _pairCode = pairCode;
        _settings.setPairCode(pairCode);
        _uploadNote = "Enter code on web";
        WatchUi.requestUpdate();
    }

    function primeSession() as Void {
        if (_requestInFlight) {
            return;
        }

        if (_pairCode.length() < 6) {
            _uploadNote = "Enter this watch code on web";
            WatchUi.requestUpdate();
            return;
        }

        if (!_settings.isApiConfigured()) {
            _uploadNote = "Set Backend URL in app settings";
            WatchUi.requestUpdate();
            return;
        }

        _api.setBaseUrl(_settings.getApiBaseUrl());
        _phase = "PAIRING";
        _uploadNote = "Pairing watch to session";
        _requestInFlight = true;

        _api.pairDevice(
            _pairCode,
            _deviceId,
            _deviceModel,
            "0.1.0",
            method(:onPairResponse)
        );

        WatchUi.requestUpdate();
    }

    function beginRecording() as Void {
        _phase = "RECORDING";
        _elapsedSeconds = 0;
        _heartRate = null;
        _stress = null;
        _hrv = null;
        _intensity = 0;
        _latestIntervals = [];
        _buffer.clear();
        _completionRequested = false;
        _pendingBatch = null;
        _uploadNote = "Capturing live heart data";
        persistUploadState();
        startSensorCapture();
        WatchUi.requestUpdate();
    }

    function finishRecording() as Void {
        stopSensorCapture();
        _completionRequested = true;
        _phase = "UPLOADING";
        _uploadNote = "Saved. Upload when online";
        persistUploadState();

        if (_requestInFlight) {
            WatchUi.requestUpdate();
            return;
        }

        flushUpload();
        WatchUi.requestUpdate();
    }

    function resetSession() as Void {
        stopSensorCapture();
        _phase = "IDLE";
        _filmTitle = "Ready to pair";
        _runtimeMinutes = 0;
        _elapsedSeconds = 0;
        _heartRate = null;
        _stress = null;
        _hrv = null;
        _intensity = 0;
        _uploadNote = "Enter watch code on web";
        _sessionId = null;
        _pendingBatch = null;
        _completionRequested = false;
        _buffer.clear();
        clearUploadState();
        WatchUi.requestUpdate();
    }

    function onTick() as Void {
        if (_phase == "IDLE") {
            primeSession();
            return;
        }

        if (_phase != "RECORDING" && _phase != "UPLOADING") {
            return;
        }

        if (_phase == "RECORDING") {
            captureSample();
        }

        if (!_requestInFlight && uploadRetryReady() && (_phase == "UPLOADING" || _buffer.queuedCount() >= 3)) {
            flushUpload();
        }

        WatchUi.requestUpdate();
    }

    function onSensorInfo(sensorInfo as Sensor.Info) as Void {
        if (sensorInfo != null && sensorInfo.heartRate != null) {
            _heartRate = sensorInfo.heartRate;
        }
    }

    function onSensorData(sensorData as Sensor.SensorData) as Void {
        if (sensorData == null || sensorData.heartRateData == null) {
            return;
        }

        if (sensorData.heartRateData.heartBeatIntervals != null) {
            _latestIntervals = sensorData.heartRateData.heartBeatIntervals;
            _capabilities[:hrv] = _latestIntervals.size() > 1;
        }
    }

    hidden function startSensorCapture() as Void {
        Sensor.setEnabledSensors([Sensor.SENSOR_HEARTRATE]);
        Sensor.enableSensorEvents(method(:onSensorInfo));

        if (!(Sensor has :registerSensorDataListener)) {
            _capabilities[:hrv] = false;
            return;
        }

        Sensor.registerSensorDataListener(
            method(:onSensorData),
            {
                :period => 4,
                :heartBeatIntervals => { :enabled => true }
            }
        );
    }

    hidden function stopSensorCapture() as Void {
        Sensor.enableSensorEvents(null);

        if (Sensor has :registerSensorDataListener) {
            Sensor.unregisterSensorDataListener();
        }
    }

    hidden function captureSample() as Void {
        _elapsedSeconds += 5;
        updateStressFromHistory();

        var heartBeatIntervals = _latestIntervals;
        _hrv = (_capabilities[:hrv] && heartBeatIntervals.size() > 1)
            ? FilmIntensityMetrics.computeRmssd(heartBeatIntervals)
            : null;
        _intensity = FilmIntensityMetrics.computeIntensity(_heartRate, _stress, _hrv);

        _buffer.addSample({
            "timestamp" => Time.now().value() * 1000,
            "elapsedMs" => _elapsedSeconds * 1000,
            "heartRateBpm" => _heartRate,
            "stressLevel" => _stress,
            "hrvRmssd" => _hrv,
            "heartBeatIntervalsMs" => []
        });
        persistUploadState();
    }

    hidden function flushUpload() as Void {
        if (_requestInFlight) {
            return;
        }

        if (!uploadRetryReady()) {
            _uploadNote = "Upload retry paused";
            WatchUi.requestUpdate();
            return;
        }

        if (_sessionId == null || _deviceToken == null) {
            _phase = "UPLOADING";
            _uploadNote = "Saved. Waiting to pair";
            persistUploadState();
            return;
        }

        if (_buffer.queuedCount() == 0) {
            if (_completionRequested) {
                requestCompletion();
            } else {
                _phase = "RECORDING";
            }

            return;
        }

        _pendingBatch = _buffer.takeBatch(6);
        _requestInFlight = true;
        _phase = "UPLOADING";
        _uploadNote = "Uploading " + _pendingBatch.size() + " samples";
        _nextUploadAttemptAt = 0;
        persistUploadState();

        _api.uploadBatch(
            _sessionId,
            _deviceId,
            _deviceToken,
            _pendingBatch,
            method(:onBatchUploaded)
        );
    }

    hidden function requestCompletion() as Void {
        if (_requestInFlight) {
            return;
        }

        _requestInFlight = true;
        _phase = "UPLOADING";
        _uploadNote = "Closing the session";
        _nextUploadAttemptAt = 0;
        persistUploadState();

        _api.completeSession(
            _sessionId,
            _deviceId,
            _deviceToken,
            _buffer.uploadedCount(),
            serializeCapabilities(),
            method(:onSessionCompleted)
        );
    }

    function onPairResponse(responseCode as Number, data) as Void {
        _requestInFlight = false;

        if (responseCode != 200 || data == null || data["deviceToken"] == null) {
            _phase = "IDLE";
            if (responseCode == 404) {
                _uploadNote = "Waiting for web session";
            } else {
                _uploadNote = "Pair failed: " + responseCode;
            }
            WatchUi.requestUpdate();
            return;
        }

        _deviceToken = data["deviceToken"];
        _settings.setDeviceToken(_deviceToken);
        _sessionId = data["activeSessionId"];
        _uploadNote = "Session paired. Loading film";
        _requestInFlight = true;
        persistUploadState();

        _api.fetchActiveSession(_deviceId, _deviceToken, method(:onActiveSessionResponse));
        WatchUi.requestUpdate();
    }

    function onActiveSessionResponse(responseCode as Number, data) as Void {
        _requestInFlight = false;

        if (responseCode != 200 || data == null || data["session"] == null) {
            _phase = "IDLE";
            _uploadNote = "No active film for this code";
            WatchUi.requestUpdate();
            return;
        }

        var session = data["session"];
        _sessionId = session["id"];
        _filmTitle = session["filmTitle"];
        _runtimeMinutes = session["runtimeMinutes"];

        if (session["capabilities"] != null) {
            _capabilities = normalizeCapabilities(session["capabilities"]);
        }

        _phase = "PRIMED";
        _uploadNote = "Ready. Select to record";
        persistUploadState();
        WatchUi.requestUpdate();
    }

    function onBatchUploaded(responseCode as Number, data) as Void {
        _requestInFlight = false;

        if (responseCode != 200 || data == null) {
            _buffer.prependSamples(_pendingBatch);
            _pendingBatch = null;
            _phase = _completionRequested ? "UPLOADING" : "RECORDING";
            scheduleUploadRetry();
            _uploadNote = _completionRequested ? "Saved. Waiting for connection" : "Upload paused: " + responseCode;
            persistUploadState();
            WatchUi.requestUpdate();
            return;
        }

        var acceptedSamples = data["acceptedSamples"];

        if (acceptedSamples == null) {
            acceptedSamples = _pendingBatch.size();
        }

        if (acceptedSamples < _pendingBatch.size()) {
            var remaining = [];

            for (var i = acceptedSamples; i < _pendingBatch.size(); i += 1) {
                remaining.add(_pendingBatch[i]);
            }

            _buffer.prependSamples(remaining);
        }

        _buffer.markUploaded(acceptedSamples);
        _pendingBatch = null;
        _nextUploadAttemptAt = 0;
        _uploadNote = "Uploaded " + acceptedSamples + " samples";
        persistUploadState();

        if (_completionRequested) {
            flushUpload();
        } else {
            _phase = "RECORDING";
        }

        WatchUi.requestUpdate();
    }

    function onSessionCompleted(responseCode as Number, data) as Void {
        _requestInFlight = false;

        if (responseCode != 200 || data == null) {
            _phase = "UPLOADING";
            scheduleUploadRetry();
            _uploadNote = "Saved. Waiting to close";
            persistUploadState();
            WatchUi.requestUpdate();
            return;
        }

        _phase = "COMPLETE";
        _uploadNote = "Session delivered";
        _completionRequested = false;
        _nextUploadAttemptAt = 0;
        _buffer.clear();
        clearUploadState();
        WatchUi.requestUpdate();
    }

    function getPhaseLabel() {
        return _phase;
    }

    function getInstructionLabel() {
        if (_phase == "IDLE") {
            return "Waiting for web";
        }

        if (_phase == "PRIMED") {
            return "SELECT to record";
        }

        if (_phase == "COMPLETE") {
            return "SELECT to reset";
        }

        if (_phase == "PAIRING") {
            return "Checking code...";
        }

        if (_phase == "UPLOADING") {
            return _requestInFlight ? "UPLOADING..." : "Auto upload";
        }

        return "SELECT to stop";
    }

    function getPairCode() {
        return (_pairCode.length() == 0) ? "------" : _pairCode;
    }

    function getFilmTitle() {
        return _filmTitle;
    }

    function getProgressLabel() {
        if (_runtimeMinutes == 0) {
            return "00:00 / --:--";
        }

        var elapsedMinutes = (_elapsedSeconds / 60).toNumber();
        var elapsedRemainder = _elapsedSeconds % 60;
        return elapsedMinutes.format("%02d") + ":" + elapsedRemainder.format("%02d")
            + " / " + _runtimeMinutes.format("%02d") + ":00";
    }

    function getHeartRateLabel() {
        return (_heartRate == null) ? "-- bpm" : (_heartRate + " bpm");
    }

    function getStressLabel() {
        return (_stress == null) ? "n/a" : _stress.toString();
    }

    function getHrvLabel() {
        return (_hrv == null) ? "n/a" : (_hrv.toNumber().toString() + " ms");
    }

    function getIntensityLabel() {
        return _intensity.toString() + " " + FilmIntensityMetrics.bandForScore(_intensity);
    }

    function getIntensityScore() {
        return _intensity;
    }

    function getQueuedSampleCount() {
        return _buffer.queuedCount();
    }

    function getUploadedSampleCount() {
        return _buffer.uploadedCount();
    }

    function getUploadNote() {
        return _uploadNote;
    }

    function getConnectivityLabel() {
        var settings = System.getDeviceSettings();
        return settings.connectionAvailable ? "Online" : "Offline";
    }

    function getCapabilityLabel() {
        if (_capabilities[:hrv] && _capabilities[:stress]) {
            return "HR + HRV + stress";
        }

        if (_capabilities[:hrv]) {
            return "HR + HRV";
        }

        if (_capabilities[:stress]) {
            return "HR + stress";
        }

        return "HR only";
    }

    hidden function supportsStressHistory() {
        return (Toybox has :SensorHistory) && (SensorHistory has :getStressHistory);
    }

    hidden function updateStressFromHistory() as Void {
        if (!supportsStressHistory()) {
            _capabilities[:stress] = false;
            return;
        }

        var stressIterator = SensorHistory.getStressHistory({
            :period => 3,
            :order => SensorHistory.ORDER_NEWEST_FIRST
        });

        var latestStressSample = stressIterator.next();

        if (latestStressSample == null || latestStressSample.data == null) {
            return;
        }

        _stress = latestStressSample.data;
        _capabilities[:stress] = true;
    }

    hidden function normalizeCapabilities(payload) {
        return {
            :heartRate => payload["heartRate"] == true,
            :stress => payload["stress"] == true,
            :hrv => payload["hrv"] == true
        };
    }

    hidden function serializeCapabilities() {
        return {
            "heartRate" => _capabilities[:heartRate],
            "stress" => _capabilities[:stress],
            "hrv" => _capabilities[:hrv]
        };
    }

    hidden function uploadRetryReady() {
        return Time.now().value() >= _nextUploadAttemptAt;
    }

    hidden function scheduleUploadRetry() as Void {
        _nextUploadAttemptAt = Time.now().value() + _uploadRetryCooldownSeconds;
    }

    hidden function restoreUploadState() as Void {
        var storedSessionId = Application.Storage.getValue(_sessionIdKey);
        var storedFilmTitle = Application.Storage.getValue(_filmTitleKey);
        var storedRuntimeMinutes = Application.Storage.getValue(_runtimeMinutesKey);
        var storedElapsedSeconds = Application.Storage.getValue(_elapsedSecondsKey);
        var storedCompletionRequested = Application.Storage.getValue(_completionRequestedKey);

        if (storedSessionId != null) {
            _sessionId = storedSessionId;
        }

        if (storedFilmTitle != null) {
            _filmTitle = storedFilmTitle;
        }

        if (storedRuntimeMinutes != null) {
            _runtimeMinutes = storedRuntimeMinutes;
        }

        if (storedElapsedSeconds != null) {
            _elapsedSeconds = storedElapsedSeconds;
        }

        _completionRequested = storedCompletionRequested == true;

        if (_sessionId != null && _deviceToken != null && (_buffer.hasPendingUpload() || _completionRequested)) {
            _phase = "UPLOADING";
            _uploadNote = "Saved. Upload when online";
        }
    }

    hidden function persistUploadState() as Void {
        if (_sessionId != null) {
            Application.Storage.setValue(_sessionIdKey, _sessionId);
        }

        Application.Storage.setValue(_filmTitleKey, _filmTitle);
        Application.Storage.setValue(_runtimeMinutesKey, _runtimeMinutes);
        Application.Storage.setValue(_elapsedSecondsKey, _elapsedSeconds);
        Application.Storage.setValue(_completionRequestedKey, _completionRequested);
    }

    hidden function clearUploadState() as Void {
        Application.Storage.deleteValue(_sessionIdKey);
        Application.Storage.deleteValue(_filmTitleKey);
        Application.Storage.deleteValue(_runtimeMinutesKey);
        Application.Storage.deleteValue(_elapsedSecondsKey);
        Application.Storage.deleteValue(_completionRequestedKey);
    }
}

class FilmIntensityPairCodeDelegate extends WatchUi.TextPickerDelegate {
    hidden var _manager;

    function initialize(manager) {
        TextPickerDelegate.initialize();
        _manager = manager;
    }

    function onTextEntered(text as String, changed as Boolean) as Boolean {
        if (changed) {
            _manager.setPairCode(text);
        }

        return true;
    }

    function onCancel() as Boolean {
        return true;
    }
}
