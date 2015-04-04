/// <reference path="../../includes.ts"/>
/// <reference path="camelPlugin.ts"/>

module Camel {

  _module.controller("Camel.PropertiesController", ["$scope", "workspace", ($scope, workspace:Workspace) => {
    var log:Logging.Logger = Logger.get("Camel");
    $scope.viewTemplate = null;
    $scope.schema = _apacheCamelModel;
    $scope.model = null;
    $scope.nodeData = null;
    $scope.icon = null;
    $scope.showHelp = true;
    $scope.showUsedOnly = false;

    $scope.$watch('showHelp', (newValue, oldValue) => {
      if (newValue !== oldValue) {
        updateData();
      }
    });

    $scope.$watch('showUsedOnly', (newValue, oldValue) => {
      if (newValue !== oldValue) {
        updateData();
      }
    });

    $scope.$on("$routeChangeSuccess", function (event, current, previous) {
      // lets do this asynchronously to avoid Error: $digest already in progress
      setTimeout(updateData, 50);
    });

    $scope.$watch('workspace.selection', function () {
      if (workspace.moveIfViewInvalid()) return;
      updateData();
    });

    $scope.showEntity = function (id) {
      log.info("Show entity: " + id);
      if ($scope.showUsedOnly) {
        // figure out if there is any data for the id
        var value = Core.pathGet($scope.nodeData, id);
        if (angular.isUndefined(value) || Core.isBlank(value)) {
          return false;
        }
        if (angular.isString(value)) {
          var aBool = "true" === value || "false" == value;
          if (aBool) {
            // hide false booleans
            return Core.parseBooleanValue(value);
          }
          // to show then must not be blank
          return !Core.isBlank(value);
        }
      }
      return true;
    };

    function updateData() {
      var routeXmlNode = getSelectedRouteNode(workspace);
      $scope.nodeData = getRouteNodeJSON(routeXmlNode);

      if (routeXmlNode) {
        $scope.model = getCamelSchema(routeXmlNode.nodeName);

        if ($scope.model) {
          if (log.enabledFor(Logger.DEBUG)) {
            log.debug("Properties - data: " + JSON.stringify($scope.nodeData, null, "  "));
            log.debug("Properties - schema: " + JSON.stringify($scope.model, null, "  "));
          }

          $scope.nodeData = getRouteNodeJSON(routeXmlNode);
          $scope.icon = getRouteNodeIcon(routeXmlNode);
          $scope.viewTemplate = "plugins/camel/html/nodePropertiesView.html";
        }
      }
    }
  }]);
}



