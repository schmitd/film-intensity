using Toybox.Communications;
using Toybox.Time;

class FilmIntensitySessionApi {
    hidden var _baseUrl = "";

    function initialize(baseUrl) {
        _baseUrl = sanitizeBaseUrl(baseUrl);
    }

    function setBaseUrl(baseUrl) {
        _baseUrl = sanitizeBaseUrl(baseUrl);
    }

    function isConfigured() {
        return _baseUrl.length() > 0;
    }

    function pairDevice(pairCode, deviceId, deviceModel, appVersion, callback) {
        makeRequest(
            "/api/device/pair",
            {
                "pairCode" => pairCode,
                "deviceId" => deviceId,
                "deviceModel" => deviceModel,
                "appVersion" => appVersion
            },
            Communications.HTTP_REQUEST_METHOD_POST,
            callback
        );
    }

    function fetchActiveSession(deviceId, deviceToken, callback) {
        var params = null;

        if (deviceToken != null) {
            params = { "deviceToken" => deviceToken };
        } else if (deviceId != null) {
            params = { "deviceId" => deviceId };
        }

        makeRequest(
            "/api/device/active-session",
            params,
            Communications.HTTP_REQUEST_METHOD_GET,
            callback
        );
    }

    function uploadBatch(sessionId, deviceId, deviceToken, batch, callback) {
        makeRequest(
            "/api/device/session-batch",
            {
                "schemaVersion" => 1,
                "sessionId" => sessionId,
                "deviceId" => deviceId,
                "deviceToken" => deviceToken,
                "samples" => batch
            },
            Communications.HTTP_REQUEST_METHOD_POST,
            callback
        );
    }

    function completeSession(sessionId, deviceId, deviceToken, totalSamples, capabilities, callback) {
        makeRequest(
            "/api/device/session-complete",
            {
                "schemaVersion" => 1,
                "sessionId" => sessionId,
                "deviceId" => deviceId,
                "deviceToken" => deviceToken,
                "completedAt" => nowMillis(),
                "totalSamples" => totalSamples,
                "capabilities" => capabilities
            },
            Communications.HTTP_REQUEST_METHOD_POST,
            callback
        );
    }

    hidden function makeRequest(path, params, method, callback) {
        if (!isConfigured()) {
            callback.invoke(-1, null);
            return;
        }

        var options = {
            :method => method,
            :headers => {
                "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON
            },
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };

        Communications.makeWebRequest(_baseUrl + path, params, options, callback);
    }

    hidden function sanitizeBaseUrl(baseUrl) {
        if (baseUrl == null) {
            return "";
        }

        if (baseUrl.length() == 0) {
            return "";
        }

        if (baseUrl.substring(baseUrl.length() - 1, baseUrl.length()) == "/") {
            return baseUrl.substring(0, baseUrl.length() - 1);
        }

        return baseUrl;
    }

    hidden function nowMillis() {
        return Time.now().value() * 1000;
    }
}
