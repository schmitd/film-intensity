using Toybox.Application;
using Toybox.WatchUi;

class FilmIntensityApp extends Application.AppBase {
    function initialize() {
        AppBase.initialize();
    }

    function getInitialView() {
        return [ new FilmIntensityView(), new FilmIntensityDelegate() ];
    }
}
