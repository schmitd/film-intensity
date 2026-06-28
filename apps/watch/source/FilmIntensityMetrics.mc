import Toybox.Math;

class FilmIntensityMetrics {
    static function computeRmssd(intervals) {
        if (intervals == null || intervals.size() < 2) {
            return null;
        }

        var sumSquares = 0.0;
        var count = 0;

        for (var i = 1; i < intervals.size(); i += 1) {
            var delta = intervals[i] - intervals[i - 1];
            sumSquares += delta * delta;
            count += 1;
        }

        if (count == 0) {
            return null;
        }

        return Math.sqrt(sumSquares / count);
    }

    static function computeIntensity(heartRate, stress, hrv) {
        var heartRateComponent = (heartRate == null) ? 0.0 : ((heartRate - 72.0) / 40.0) * 44.0;
        var stressComponent = (stress == null) ? 0.0 : (stress / 100.0) * 34.0;
        var hrvComponent = (hrv == null) ? 0.0 : ((48.0 - hrv) / 48.0) * 28.0;
        var score = heartRateComponent + stressComponent + hrvComponent + 18.0;

        if (score < 0) {
            return 0;
        }

        if (score > 100) {
            return 100;
        }

        return score.toNumber();
    }

    static function bandForScore(score) {
        if (score >= 85) {
            return "OVERDRIVE";
        }

        if (score >= 67) {
            return "SPIKE";
        }

        if (score >= 42) {
            return "RISING";
        }

        return "CALM";
    }
}
