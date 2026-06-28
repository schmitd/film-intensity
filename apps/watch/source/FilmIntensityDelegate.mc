using Toybox.System;
using Toybox.WatchUi;

class FilmIntensityDelegate extends WatchUi.BehaviorDelegate {
    hidden var _manager;

    function initialize() {
        BehaviorDelegate.initialize();
        _manager = SessionManager.getInstance();
    }

    function onSelect() {
        _manager.advanceAction();
        WatchUi.requestUpdate();
        return true;
    }

    function onMenu() {
        if (!(WatchUi has :TextPicker)) {
            return false;
        }

        _manager.beginPairCodeEdit();
        return true;
    }
}
