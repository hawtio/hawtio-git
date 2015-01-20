/// <reference path="../../includes.ts"/>
/// <reference path="osgiHelpers.ts"/>

/**
 * @module Osgi
 * @main Osgi
 */
module Osgi {
  var pluginName = 'osgi';

  export var _module = angular.module(pluginName, ['ngResource', 'hawtio-core', 'hawtio-ui']);
  //export var _module = angular.module(pluginName, ['bootstrap', 'ngResource', 'ngGrid', 'hawtio-core', 'hawtio-ui']);

  _module.config(["$routeProvider", ($routeProvider) => {
    $routeProvider.
            when('/osgi/bundle-list', {templateUrl: 'plugins/osgi/html/bundle-list.html'}).
            when('/osgi/bundles', {templateUrl: 'plugins/osgi/html/bundles.html'}).
            when('/osgi/bundle/:bundleId', {templateUrl: 'plugins/osgi/html/bundle.html'}).
            when('/osgi/services', {templateUrl: 'plugins/osgi/html/services.html'}).
            when('/osgi/packages', {templateUrl: 'plugins/osgi/html/packages.html'}).
            when('/osgi/package/:package/:version', {templateUrl: 'plugins/osgi/html/package.html'}).
            when('/osgi/configurations', {templateUrl: 'plugins/osgi/html/configurations.html'}).
            when('/osgi/pid/:pid/:factoryPid', {templateUrl: 'plugins/osgi/html/pid.html'}).
            when('/osgi/pid/:pid', {templateUrl: 'plugins/osgi/html/pid.html'}).
            when('/osgi/fwk', {templateUrl: 'plugins/osgi/html/framework.html'}).
            when('/osgi/dependencies', {templateUrl: 'plugins/osgi/html/svc-dependencies.html', reloadOnSearch: false })
  }]);

  _module.run(["workspace", "viewRegistry", "helpRegistry", (workspace:Workspace, viewRegistry, helpRegistry) => {

    viewRegistry['osgi'] = "plugins/osgi/html/layoutOsgi.html";
    helpRegistry.addUserDoc('osgi', 'plugins/osgi/doc/help.md', () => {
      return workspace.treeContainsDomainAndProperties("osgi.core");
    });

    workspace.topLevelTabs.push({
      id: "osgi",
      content: "OSGi",
      title: "Visualise and manage the bundles and services in this OSGi container",
      isValid: (workspace: Workspace) => workspace.treeContainsDomainAndProperties("osgi.core"),
      href: () => "#/osgi/bundle-list",
      isActive: (workspace: Workspace) => workspace.isLinkActive("osgi")
    });
  }]);

  _module.factory('osgiDataService', ["workspace", "jolokia", (workspace: Workspace, jolokia) => {
    return new OsgiDataService(workspace, jolokia);
  }]);

  hawtioPluginLoader.addModule(pluginName);
}
