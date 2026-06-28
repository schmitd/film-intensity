using Toybox.Application;

class FilmIntensitySampleBuffer {
    hidden var _samples = [];
    hidden var _uploadedCount = 0;
    hidden var _samplesKey = "queuedSamples";
    hidden var _uploadedCountKey = "uploadedSampleCount";

    function initialize() {
        var storedSamples = Application.Storage.getValue(_samplesKey);
        var storedUploadedCount = Application.Storage.getValue(_uploadedCountKey);

        if (storedSamples != null) {
            _samples = storedSamples;
        }

        if (storedUploadedCount != null) {
            _uploadedCount = storedUploadedCount;
        }
    }

    function addSample(sample) {
        _samples.add(sample);
        persist();
    }

    function queuedCount() {
        return _samples.size();
    }

    function uploadedCount() {
        return _uploadedCount;
    }

    function takeBatch(maxBatchSize) {
        var batch = [];
        var count = (maxBatchSize < _samples.size()) ? maxBatchSize : _samples.size();

        for (var i = 0; i < count; i += 1) {
            batch.add(_samples.remove(0));
        }

        return batch;
    }

    function prependSamples(samples) {
        if (samples == null || samples.size() == 0) {
            return;
        }

        var merged = [];

        for (var i = 0; i < samples.size(); i += 1) {
            merged.add(samples[i]);
        }

        for (var j = 0; j < _samples.size(); j += 1) {
            merged.add(_samples[j]);
        }

        _samples = merged;
        persist();
    }

    function markUploaded(batchCount) {
        _uploadedCount += batchCount;
        persist();
    }

    function clear() {
        _samples = [];
        _uploadedCount = 0;
        persist();
    }

    function hasPendingUpload() {
        return _samples.size() > 0 || _uploadedCount > 0;
    }

    hidden function persist() as Void {
        Application.Storage.setValue(_samplesKey, _samples);
        Application.Storage.setValue(_uploadedCountKey, _uploadedCount);
    }
}
