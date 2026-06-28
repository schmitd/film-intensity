using Toybox.Graphics;
using Toybox.WatchUi;

class FilmIntensityView extends WatchUi.View {
    hidden var _manager;
    hidden var _ink = 0xF7E7D5;
    hidden var _muted = 0xB9AA99;
    hidden var _bg = 0x000000;
    hidden var _panel = 0x251D20;
    hidden var _line = 0x5A4542;
    hidden var _ember = 0xFF8552;
    hidden var _gold = 0xFFB35F;
    hidden var _cyan = 0x6ED4D5;
    hidden var _live = 0x7DDC9A;
    hidden var _stopRed = 0xF23B35;

    function initialize() {
        View.initialize();
        _manager = SessionManager.getInstance();
    }

    function onShow() {
        _manager.startTicker();
    }

    function onHide() {
        _manager.stopTicker();
    }

    function onUpdate(dc) {
        var layoutWidth = dc.getWidth();
        var layoutHeight = dc.getHeight();
        var gutter = 46;
        var contentWidth = layoutWidth - (gutter * 2);
        var centerX = layoutWidth / 2;
        var phase = _manager.getPhaseLabel();

        dc.setColor(_bg, _bg);
        dc.fillRectangle(0, 0, layoutWidth, layoutHeight);

        drawSignalRail(dc, layoutWidth);
        drawTopBar(dc, centerX, 38, contentWidth, phase);

        if (phase == "RECORDING" || phase == "UPLOADING" || phase == "COMPLETE") {
            drawRecordingScreen(dc, gutter, contentWidth, centerX, layoutHeight, phase);
        } else {
            drawPairingScreen(dc, gutter, contentWidth, centerX, layoutHeight, phase);
        }

        if (phase == "RECORDING") {
            drawStopIndicator(dc, centerX, layoutHeight);
        } else {
            drawBottomHint(dc, centerX, layoutHeight);
        }
    }

    hidden function drawSignalRail(dc, width) as Void {
        var center = width / 2;
        var radius = (width / 2) - 24;

        dc.setPenWidth(4);
        dc.setColor(_ember, _ember);
        dc.drawArc(center, center, radius, Graphics.ARC_CLOCKWISE, 112, 91);
        dc.setColor(_cyan, _cyan);
        dc.drawArc(center, center, radius, Graphics.ARC_CLOCKWISE, 88, 78);
        dc.setPenWidth(1);
    }

    hidden function drawTopBar(dc, centerX, y, width, phase) as Void {
        dc.setColor(phaseColor(), Graphics.COLOR_TRANSPARENT);
        drawFittedText(
            dc,
            centerX,
            y,
            Graphics.FONT_XTINY,
            phase + "  " + _manager.getConnectivityLabel(),
            210,
            Graphics.TEXT_JUSTIFY_CENTER
        );

        dc.setColor(_muted, Graphics.COLOR_TRANSPARENT);
        drawFittedText(dc, centerX, y + 24, Graphics.FONT_TINY, _manager.getFilmTitle(), width - 54, Graphics.TEXT_JUSTIFY_CENTER);
    }

    hidden function drawPairingScreen(dc, x, width, centerX, height, phase) as Void {
        var codeY = (height / 2) - 44;
        var noteY = (height / 2) + 48;

        dc.setColor(_muted, Graphics.COLOR_TRANSPARENT);
        dc.drawText(centerX, codeY, Graphics.FONT_XTINY, "WATCH CODE", Graphics.TEXT_JUSTIFY_CENTER);

        dc.setColor(_live, Graphics.COLOR_TRANSPARENT);
        dc.drawText(centerX, codeY + 24, Graphics.FONT_NUMBER_MILD, _manager.getPairCode(), Graphics.TEXT_JUSTIFY_CENTER);

        dc.setColor(_ink, Graphics.COLOR_TRANSPARENT);
        drawFittedText(dc, centerX, noteY, Graphics.FONT_XTINY, _manager.getUploadNote(), width - 32, Graphics.TEXT_JUSTIFY_CENTER);
    }

    hidden function drawRecordingScreen(dc, x, width, centerX, height, phase) as Void {
        var score = _manager.getIntensityScore();
        var primaryY = 106;
        var barY = 238;

        dc.setColor(_muted, Graphics.COLOR_TRANSPARENT);
        drawFittedText(dc, centerX, primaryY, Graphics.FONT_XTINY, _manager.getProgressLabel(), 250, Graphics.TEXT_JUSTIFY_CENTER);

        dc.setColor(_muted, Graphics.COLOR_TRANSPARENT);
        dc.drawText(centerX, primaryY + 28, Graphics.FONT_XTINY, "INTENSITY", Graphics.TEXT_JUSTIFY_CENTER);

        dc.setColor(intensityColor(score), Graphics.COLOR_TRANSPARENT);
        dc.drawText(centerX, primaryY + 54, Graphics.FONT_NUMBER_MILD, score.toString(), Graphics.TEXT_JUSTIFY_CENTER);

        dc.setColor(_ink, Graphics.COLOR_TRANSPARENT);
        drawFittedText(dc, centerX, primaryY + 108, Graphics.FONT_XTINY, FilmIntensityMetrics.bandForScore(score), width, Graphics.TEXT_JUSTIFY_CENTER);

        var fillWidth = (width * score / 100).toNumber();
        if (fillWidth < 4) {
            fillWidth = 4;
        }

        dc.setPenWidth(4);
        dc.setColor(_line, Graphics.COLOR_TRANSPARENT);
        dc.drawLine(x, barY, x + width, barY);

        dc.setColor(intensityColor(score), Graphics.COLOR_TRANSPARENT);
        dc.drawLine(x, barY, x + fillWidth, barY);
        dc.setPenWidth(1);

        drawMetricRow(dc, x, barY + 28, width);

        dc.setColor(_muted, Graphics.COLOR_TRANSPARENT);
        drawFittedText(dc, centerX, height - 64, Graphics.FONT_XTINY, _manager.getUploadNote(), 230, Graphics.TEXT_JUSTIFY_CENTER);
    }

    hidden function drawMetricRow(dc, x, y, width) as Void {
        var columnWidth = width / 2;

        drawMetricCell(dc, x, y, columnWidth, "HR", _manager.getHeartRateLabel(), _ember);
        drawMetricCell(dc, x + columnWidth, y, columnWidth, "STRESS", _manager.getStressLabel(), _gold);
    }

    hidden function drawMetricCell(dc, x, y, width, label, value, color) as Void {
        dc.setColor(_muted, Graphics.COLOR_TRANSPARENT);
        dc.drawText(x + (width / 2), y, Graphics.FONT_XTINY, label, Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        drawFittedText(dc, x + (width / 2), y + 20, Graphics.FONT_TINY, value, width - 8, Graphics.TEXT_JUSTIFY_CENTER);
    }

    hidden function drawStopIndicator(dc, centerX, height) as Void {
        var squareSize = 16;
        var x = centerX + 120;
        var y = height - 108;
        var radius = (height / 2) - 24;

        dc.setPenWidth(4);
        dc.setColor(_stopRed, Graphics.COLOR_TRANSPARENT);
        dc.drawArc(centerX, height / 2, radius, Graphics.ARC_CLOCKWISE, 331, 345);
        dc.setPenWidth(1);
        dc.setColor(_stopRed, _stopRed);
        dc.fillRectangle(x, y, squareSize, squareSize);
    }

    hidden function drawBottomHint(dc, centerX, height) as Void {
        dc.setColor(_ink, Graphics.COLOR_TRANSPARENT);
        drawFittedText(dc, centerX, height - 48, Graphics.FONT_XTINY, _manager.getInstructionLabel(), 220, Graphics.TEXT_JUSTIFY_CENTER);
    }

    hidden function drawFittedText(dc, x, y, font, text, width, justify) as Void {
        dc.drawText(x, y, font, fitText(text, width, font), justify);
    }

    hidden function fitText(text, width, font) {
        if (text == null) {
            return "";
        }

        var charWidth = 8;

        if (font == Graphics.FONT_XTINY) {
            charWidth = 6;
        } else if (font == Graphics.FONT_TINY) {
            charWidth = 8;
        } else if (font == Graphics.FONT_SMALL) {
            charWidth = 10;
        } else if (font == Graphics.FONT_MEDIUM) {
            charWidth = 14;
        }

        var maxChars = (width / charWidth).toNumber();

        if (maxChars < 4 || text.length() <= maxChars) {
            return text;
        }

        return text.substring(0, maxChars - 3) + "...";
    }

    hidden function phaseColor() {
        var phase = _manager.getPhaseLabel();

        if (phase == "RECORDING") {
            return _live;
        }

        if (phase == "UPLOADING" || phase == "PAIRING") {
            return _cyan;
        }

        if (phase == "COMPLETE") {
            return _gold;
        }

        return _muted;
    }

    hidden function intensityColor(score) {
        if (score >= 85) {
            return _ember;
        }

        if (score >= 67) {
            return _gold;
        }

        if (score >= 42) {
            return _cyan;
        }

        return _live;
    }
}
