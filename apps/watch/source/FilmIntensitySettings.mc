using Toybox.Application;
using Toybox.Application.Properties;
using Toybox.System;
using Toybox.Time;

class FilmIntensitySettings {
    hidden var _apiBaseUrlProperty = "api_base_url";

    function initialize() {
    }

    function getPairCode() {
        var value = Application.Storage.getValue("pairCode");

        if (value != null && value.toString().length() >= 6) {
            return value.toString();
        }

        var generatedCode = generatePairCode();
        setPairCode(generatedCode);
        return generatedCode;
    }

    function setPairCode(pairCode) {
        Application.Storage.setValue("pairCode", pairCode);
    }

    function getApiBaseUrl() {
        var propertyValue = Properties.getValue(_apiBaseUrlProperty);

        if (propertyValue != null && propertyValue.toString().length() > 0) {
            return propertyValue.toString();
        }

        var storedValue = Application.Storage.getValue("apiBaseUrl");
        return (storedValue == null) ? "" : storedValue.toString();
    }

    function setApiBaseUrl(apiBaseUrl) {
        Application.Storage.setValue("apiBaseUrl", apiBaseUrl);
    }

    function getDeviceToken() {
        var value = Application.Storage.getValue("deviceToken");
        return (value == null) ? null : value.toString();
    }

    function setDeviceToken(deviceToken) {
        Application.Storage.setValue("deviceToken", deviceToken);
    }

    function clearDeviceToken() {
        Application.Storage.deleteValue("deviceToken");
    }

    function getDeviceId() {
        var settings = System.getDeviceSettings();

        if (settings.uniqueIdentifier != null) {
            return settings.uniqueIdentifier;
        }

        return "film-intensity-device";
    }

    function getDeviceModel() {
        var settings = System.getDeviceSettings();
        return settings.partNumber;
    }

    function isApiConfigured() {
        return getApiBaseUrl().length() > 0;
    }

    hidden function generatePairCode() {
        var code = (Time.now().value() % 900000) + 100000;
        return code.format("%06d");
    }
}
