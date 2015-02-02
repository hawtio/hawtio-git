/// <reference path="../../includes.ts"/>
/// <reference path="camelHelpers.ts"/>

/**
 *
 * @module Camel
 * @main Camel
 */
module Camel {
  import jmxModule = Jmx;

  export var pluginName = 'camel';

  var routeToolBar = "plugins/camel/html/attributeToolBarRoutes.html";
  var contextToolBar = "plugins/camel/html/attributeToolBarContext.html";

  export var _module = angular.module(pluginName, []);

  _module.config(["$routeProvider", ($routeProvider) => {
    $routeProvider
            .when('/camel/browseEndpoint', {templateUrl: 'plugins/camel/html/browseEndpoint.html'})
            .when('/camel/endpoint/browse/:contextId/*endpointPath', {templateUrl: 'plugins/camel/html/browseEndpoint.html'})
            .when('/camel/createEndpoint', {templateUrl: 'plugins/camel/html/createEndpoint.html'})
            .when('/camel/route/diagram/:contextId/:routeId', {templateUrl: 'plugins/camel/html/routes.html'})
            .when('/camel/routes', {templateUrl: 'plugins/camel/html/routes.html'})
            .when('/camel/fabricDiagram', {templateUrl: 'plugins/camel/html/fabricDiagram.html', reloadOnSearch: false})
            .when('/camel/typeConverter', {templateUrl: 'plugins/camel/html/typeConverter.html', reloadOnSearch: false})
            .when('/camel/restRegistry', {templateUrl: 'plugins/camel/html/restRegistry.html', reloadOnSearch: false})
            .when('/camel/routeMetrics', {templateUrl: 'plugins/camel/html/routeMetrics.html', reloadOnSearch: false})
            .when('/camel/sendMessage', {templateUrl: 'plugins/camel/html/sendMessage.html', reloadOnSearch: false})
            .when('/camel/source', {templateUrl: 'plugins/camel/html/source.html'})
            .when('/camel/traceRoute', {templateUrl: 'plugins/camel/html/traceRoute.html'})
            .when('/camel/debugRoute', {templateUrl: 'plugins/camel/html/debug.html'})
            .when('/camel/profileRoute', {templateUrl: 'plugins/camel/html/profileRoute.html'})
            .when('/camel/properties', {templateUrl: 'plugins/camel/html/properties.html'});
  }]);

  _module.factory('tracerStatus',function () {
    return {
      jhandle: null,
      messages: []
    };
  });

  _module.filter('camelIconClass', () => iconClass);

  _module.factory('activeMQMessage', () => {
      return { 'message' : null}
  });

  _module.run(["HawtioNav", "workspace", "jolokia", "viewRegistry", "layoutFull", "helpRegistry", "preferencesRegistry", "$templateCache", (nav:HawtioMainNav.Registry, workspace:Workspace, jolokia, viewRegistry, layoutFull, helpRegistry, preferencesRegistry, $templateCache:ng.ITemplateCacheService) => {

    viewRegistry['camel/endpoint/'] = layoutFull;
    viewRegistry['camel/route/'] = layoutFull;
    viewRegistry['camel/fabricDiagram'] = layoutFull;
    viewRegistry['camel'] = 'plugins/camel/html/layoutCamelTree.html';

    helpRegistry.addUserDoc('camel', 'plugins/camel/doc/help.md', () => {
      return workspace.treeContainsDomainAndProperties(jmxDomain);
    });
    preferencesRegistry.addTab('Camel', 'plugins/camel/html/preferences.html', () => {
      return workspace.treeContainsDomainAndProperties(jmxDomain); 
    });

    // TODO should really do this via a service that the JMX plugin exposes
    Jmx.addAttributeToolBar(pluginName, jmxDomain, (selection: NodeSelection) => {
      // TODO there should be a nicer way to do this!
      var typeName = selection.typeName;
      if (typeName) {
        if (typeName.startsWith("context")) return contextToolBar;
        if (typeName.startsWith("route")) return routeToolBar;
      }
      var folderNames = selection.folderNames;
      if (folderNames && selection.domain === jmxDomain) {
        var last = folderNames.last();
        if ("routes" === last)  return routeToolBar;
        if ("context" === last)  return contextToolBar;
      }
      return null;
    });



    // register default attribute views
    var stateField = 'State';
    var stateTemplate = '<div class="ngCellText pagination-centered" title="{{row.getProperty(col.field)}}"><i class="{{row.getProperty(\'' + stateField + '\') | camelIconClass}}"></i></div>';
    var stateColumn = {field: stateField, displayName: stateField,
      cellTemplate: stateTemplate,
      width: 56,
      minWidth: 56,
      maxWidth: 56,
      resizable: false,
      defaultSort: false
      // we do not want to default sort the state column
    };

    var attributes = workspace.attributeColumnDefs;
    attributes[jmxDomain + "/context/folder"] = [
      stateColumn,
      {field: 'CamelId', displayName: 'Context'},
      {field: 'Uptime', displayName: 'Uptime', visible: false},
      {field: 'CamelVersion', displayName: 'Version', visible: false},
      {field: 'ExchangesCompleted', displayName: 'Completed #'},
      {field: 'ExchangesFailed', displayName: 'Failed #'},
      {field: 'FailuresHandled', displayName: 'Failed Handled #'},
      {field: 'ExchangesTotal', displayName: 'Total #', visible: false},
      {field: 'InflightExchanges', displayName: 'Inflight #'},
      {field: 'MeanProcessingTime', displayName: 'Mean Time'},
      {field: 'MinProcessingTime', displayName: 'Min Time'},
      {field: 'MaxProcessingTime', displayName: 'Max Time'},
      {field: 'TotalProcessingTime', displayName: 'Total Time', visible: false},
      {field: 'LastProcessingTime', displayName: 'Last Time', visible: false},
      {field: 'LastExchangeCompletedTimestamp', displayName: 'Last completed', visible: false},
      {field: 'LastExchangeFailedTimestamp', displayName: 'Last failed', visible: false},
      {field: 'Redeliveries', displayName: 'Redelivery #', visible: false},
      {field: 'ExternalRedeliveries', displayName: 'External Redelivery #', visible: false}
    ];
    attributes[jmxDomain + "/routes/folder"] = [
      stateColumn,
      {field: 'CamelId', displayName: 'Context'},
      {field: 'RouteId', displayName: 'Route'},
      {field: 'ExchangesCompleted', displayName: 'Completed #'},
      {field: 'ExchangesFailed', displayName: 'Failed #'},
      {field: 'FailuresHandled', displayName: 'Failed Handled #'},
      {field: 'ExchangesTotal', displayName: 'Total #', visible: false},
      {field: 'InflightExchanges', displayName: 'Inflight #'},
      {field: 'MeanProcessingTime', displayName: 'Mean Time'},
      {field: 'MinProcessingTime', displayName: 'Min Time'},
      {field: 'MaxProcessingTime', displayName: 'Max Time'},
      {field: 'TotalProcessingTime', displayName: 'Total Time', visible: false},
      {field: 'DeltaProcessingTime', displayName: 'Delta Time', visible: false},
      {field: 'LastProcessingTime', displayName: 'Last Time', visible: false},
      {field: 'LastExchangeCompletedTimestamp', displayName: 'Last completed', visible: false},
      {field: 'LastExchangeFailedTimestamp', displayName: 'Last failed', visible: false},
      {field: 'Redeliveries', displayName: 'Redelivery #', visible: false},
      {field: 'ExternalRedeliveries', displayName: 'External Redelivery #', visible: false}
    ];
    attributes[jmxDomain + "/processors/folder"] = [
      stateColumn,
      {field: 'CamelId', displayName: 'Context'},
      {field: 'RouteId', displayName: 'Route'},
      {field: 'ProcessorId', displayName: 'Processor'},
      {field: 'ExchangesCompleted', displayName: 'Completed #'},
      {field: 'ExchangesFailed', displayName: 'Failed #'},
      {field: 'FailuresHandled', displayName: 'Failed Handled #'},
      {field: 'ExchangesTotal', displayName: 'Total #', visible: false},
      {field: 'InflightExchanges', displayName: 'Inflight #'},
      {field: 'MeanProcessingTime', displayName: 'Mean Time'},
      {field: 'MinProcessingTime', displayName: 'Min Time'},
      {field: 'MaxProcessingTime', displayName: 'Max Time'},
      {field: 'TotalProcessingTime', displayName: 'Total Time', visible: false},
      {field: 'LastProcessingTime', displayName: 'Last Time', visible: false},
      {field: 'LastExchangeCompletedTimestamp', displayName: 'Last completed', visible: false},
      {field: 'LastExchangeFailedTimestamp', displayName: 'Last failed', visible: false},
      {field: 'Redeliveries', displayName: 'Redelivery #', visible: false},
      {field: 'ExternalRedeliveries', displayName: 'External Redelivery #', visible: false}
    ];
    attributes[jmxDomain + "/components/folder"] = [
      stateColumn,
      {field: 'CamelId', displayName: 'Context'},
      {field: 'ComponentName', displayName: 'Name'}
    ];
    attributes[jmxDomain + "/consumers/folder"] = [
      stateColumn,
      {field: 'CamelId', displayName: 'Context'},
      {field: 'RouteId', displayName: 'Route'},
      {field: 'EndpointUri', displayName: 'Endpoint URI', width: "**"},
      {field: 'Suspended', displayName: 'Suspended', resizable: false},
      {field: 'InflightExchanges', displayName: 'Inflight #'}
    ];
    attributes[jmxDomain + "/services/folder"] = [
      stateColumn,
      {field: 'CamelId', displayName: 'Context'},
      {field: 'RouteId', displayName: 'Route'},
      {field: 'Suspended', displayName: 'Suspended', resizable: false},
      {field: 'SupportsSuspended', displayName: 'Can Suspend', resizable: false}
    ];
    attributes[jmxDomain + "/endpoints/folder"] = [
      stateColumn,
      {field: 'CamelId', displayName: 'Context'},
      {field: 'EndpointUri', displayName: 'Endpoint URI', width: "***"},
      {field: 'Singleton', displayName: 'Singleton', resizable: false }
    ];
    attributes[jmxDomain + "/threadpools/folder"] = [
      {field: 'Id', displayName: 'Id', width: "**"},
      {field: 'ActiveCount', displayName: 'Active #'},
      {field: 'PoolSize', displayName: 'Pool Size'},
      {field: 'CorePoolSize', displayName: 'Core Pool Size'},
      {field: 'TaskQueueSize', displayName: 'Task Queue Size'},
      {field: 'TaskCount', displayName: 'Task #'},
      {field: 'CompletedTaskCount', displayName: 'Completed Task #'}
    ];
    attributes[jmxDomain + "/errorhandlers/folder"] = [
      {field: 'CamelId', displayName: 'Context'},
      {field: 'DeadLetterChannel', displayName: 'Dead Letter'},
      {field: 'DeadLetterChannelEndpointUri', displayName: 'Endpoint URI', width: "**", resizable: true},
      {field: 'MaximumRedeliveries', displayName: 'Max Redeliveries'},
      {field: 'RedeliveryDelay', displayName: 'Redelivery Delay'},
      {field: 'MaximumRedeliveryDelay', displayName: 'Max Redeliveries Delay'}
    ];

    var builder = nav.builder();
    var tab = builder.id('camel')
                .title( () => 'Camel' )
                .href( () => '/jmx/attributes?tab=camel' )
                .isSelected( () => workspace.isTopTabActive('camel') )
                .isValid( () => workspace.treeContainsDomainAndProperties(jmxDomain) )
                .build();

    // add sub level tabs
    tab.tabs = Jmx.getNavItems(builder, workspace, $templateCache);

    // special for route diagram as we want this to be the 1st
    tab.tabs.push({
      id: 'camel-route-diagram',
      title: () => 'Route Diagram',
      //title: "View a diagram of the Camel routes",
      show: () => workspace.isRoute() && workspace.hasInvokeRightsForName(getSelectionCamelContextMBean(workspace), "dumpRoutesAsXml"),
      isSelected: () => workspace.isLinkActive('camel/routes'),
      href: () => "/camel/routes" + workspace.hash(),
      // make sure we have route diagram shown first
      index: -2
    });
    tab.tabs.push({
      id: 'camel-route-metrics',
      title: () => '<i class="fa fa-bar-chart"></i> Route Metrics',
      //title: "View the entire JVMs Camel route metrics",
      show: () => !workspace.isEndpointsFolder()
        && (workspace.isRoute() || workspace.isRoutesFolder() || workspace.isCamelContext())
        && Camel.isCamelVersionEQGT(2, 14, workspace, jolokia)
        && workspace.hasInvokeRightsForName(getSelectionCamelRouteMetrics(workspace), "dumpStatisticsAsJson"),
      isSelected: () => workspace.isLinkActive('camel/routeMetrics'),
      href: () => "/camel/routeMetrics" + workspace.hash()
    });
    tab.tabs.push({
      id: 'camel-source',
      title: () => '<i class=" fa fa-file-alt"></i> Source',
      //title: "View the source of the Camel routes",
      show: () => !workspace.isEndpointsFolder()
        && (workspace.isRoute() || workspace.isRoutesFolder() || workspace.isCamelContext())
        && workspace.hasInvokeRightsForName(getSelectionCamelContextMBean(workspace), "dumpRoutesAsXml"),
      isSelected: () => workspace.isLinkActive('camel/source'),
      href: () => "/camel/source" + workspace.hash()
    });
    tab.tabs.push({
      id: 'camel-properties',
      title: () => '<i class=" fa fa-edit"></i> Properties',
      //title: "View the pattern properties",
      show: () => getSelectedRouteNode(workspace),
      isSelected: () => workspace.isLinkActive('camel/properties'),
      href: () => "/camel/properties" + workspace.hash()
    });
    tab.tabs.push({
      id: 'camel-type-converters',
      title: () => '<i class="fa fa-list"></i> Type Converters',
      //title: "List all the type converters registered in the context",
      show: () => workspace.isTopTabActive("camel")
        && !workspace.isEndpointsFolder() && !workspace.isRoute()
        && Camel.isCamelVersionEQGT(2, 13, workspace, jolokia)
        && workspace.hasInvokeRightsForName(getSelectionCamelTypeConverter(workspace), "listTypeConverters"),
      isSelected: () => workspace.isLinkActive('camel/typeConverter'),
      href: () => "/camel/typeConverter" + workspace.hash()
    });
    tab.tabs.push({
      id: 'camel-rest-services',
      title: () =>'<i class="fa fa-list"></i> Rest Services',
      //title: "List all the REST services registered in the context",
      show: () => workspace.isTopTabActive("camel")
        && !workspace.isEndpointsFolder() && !workspace.isRoute()
        && Camel.isCamelVersionEQGT(2, 14, workspace, jolokia)
        && workspace.hasInvokeRightsForName(getSelectionCamelRestRegistry(workspace), "listRestServices"),
      isSelected: () => workspace.isLinkActive('camel/restRegistry'),
      href: () => "/camel/restRegistry" + workspace.hash()
    });
    tab.tabs.push({
      id: 'camel-browser',
      title: () => '<i class="fa fa-envelope"></i> Browse',
      //title: "Browse the messages on the endpoint",
      show: () => workspace.isEndpoint()
        && workspace.hasInvokeRights(workspace.selection, "browseAllMessagesAsXml"),
      isSelected: () => workspace.isLinkActive('camel/browseEndpoint'),
      href: () => "/camel/browseEndpoint" + workspace.hash()
    });
    tab.tabs.push({
      id: 'camel-debug',
      title: () => '<i class="fa fa-stethoscope"></i> Debug',
      //title: "Debug the Camel route",
      show: () => workspace.isRoute()
        && Camel.getSelectionCamelDebugMBean(workspace)
        && workspace.hasInvokeRightsForName(Camel.getSelectionCamelDebugMBean(workspace), "getBreakpoints"),
      isSelected: () => workspace.isLinkActive('camel/debugRoute'),
      href: () => "/camel/debugRoute" + workspace.hash()
    });
    tab.tabs.push({
      id: 'camel-trace',
      title: () => '<i class="fa fa-envelope"></i> Trace',
      //title: "Trace the messages flowing through the Camel route",
      show: () => workspace.isRoute()
        && Camel.getSelectionCamelTraceMBean(workspace)
        && workspace.hasInvokeRightsForName(Camel.getSelectionCamelTraceMBean(workspace), "dumpAllTracedMessagesAsXml"),
      isSelected: () => workspace.isLinkActive('camel/traceRoute'),
      href: () => "/camel/traceRoute" + workspace.hash()
    });
    tab.tabs.push({
      id: 'camel-profile',
      title: () => '<i class="fa fa-bar-chart"></i> Profile',
      //title: "Profile the messages flowing through the Camel route",
      show: () => workspace.isRoute()
        && Camel.getSelectionCamelTraceMBean(workspace)
        && workspace.hasInvokeRightsForName(Camel.getSelectionCamelTraceMBean(workspace), "dumpAllTracedMessagesAsXml"),
      isSelected: () => workspace.isLinkActive('camel/profileRoute'),
      href: () => "/camel/profileRoute" + workspace.hash()
    });
    tab.tabs.push({
      id: 'camel-send',
      title: () => '<i class="fa fa-pencil"></i> Send',
      //title: "Send a message to this endpoint",
      show: () => workspace.isEndpoint()
        && workspace.hasInvokeRights(workspace.selection, workspace.selection.domain === "org.apache.camel" ? "sendBodyAndHeaders" : "sendTextMessage"),
      isSelected: () => workspace.isLinkActive('camel/sendMessage'),
      href: () => "/camel/sendMessage" + workspace.hash()
    });
    tab.tabs.push({
      id: 'camel-endpoint',
      title: () =>'<i class="fa fa-plus"></i> Endpoint',
      //title: "Create a new endpoint",
      show: () => workspace.isEndpointsFolder()
        && workspace.hasInvokeRights(workspace.selection, "createEndpoint"),
      isSelected: () => workspace.isLinkActive('camel/createEndpoint'),
      href: () => "/camel/createEndpoint" + workspace.hash()
    });

    nav.add(tab);

  }]);

  hawtioPluginLoader.addModule(pluginName);

  // register the jmx lazy loader here as it won't have been invoked in the run method
  hawtioPluginLoader.registerPreBootstrapTask((task) => {
    jmxModule.registerLazyLoadHandler(jmxDomain, (folder:Folder) => {
      if (jmxDomain === folder.domain && "routes" === folder.typeName) {
        return (workspace, folder, onComplete) => {
          if ("routes" === folder.typeName) {
            processRouteXml(workspace, workspace.jolokia, folder, (route) => {
              if (route) {
                addRouteChildren(folder, route);
              }
              onComplete();
            });
          } else {
            onComplete();
          }
        }
      }
      return null;
    });
    task();
  });
}
