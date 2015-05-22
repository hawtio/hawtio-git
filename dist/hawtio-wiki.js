/// <reference path="../libs/hawtio-forms/defs.d.ts"/>
/// <reference path="../libs/hawtio-jmx/defs.d.ts"/>
/// <reference path="../libs/hawtio-ui/defs.d.ts"/>
/// <reference path="../libs/hawtio-utilities/defs.d.ts"/>

/// <reference path="../../includes.ts"/>

/// <reference path="../../includes.ts"/>
/// <reference path="dockerRegistryInterfaces.ts"/>
var DockerRegistry;
(function (DockerRegistry) {
    DockerRegistry.context = '/docker-registry';
    DockerRegistry.hash = UrlHelpers.join('#', DockerRegistry.context);
    DockerRegistry.defaultRoute = UrlHelpers.join(DockerRegistry.hash, 'list');
    DockerRegistry.basePath = UrlHelpers.join('plugins', DockerRegistry.context);
    DockerRegistry.templatePath = UrlHelpers.join(DockerRegistry.basePath, 'html');
    DockerRegistry.pluginName = 'DockerRegistry';
    DockerRegistry.log = Logger.get(DockerRegistry.pluginName);
    DockerRegistry.SEARCH_FRAGMENT = '/v1/search';
    /**
     * Fetch the available docker images in the registry, can only
     * be called after app initialization
     */
    function getDockerImageRepositories(callback) {
        var DockerRegistryRestURL = HawtioCore.injector.get("DockerRegistryRestURL");
        var $http = HawtioCore.injector.get("$http");
        DockerRegistryRestURL.then(function (restURL) {
            $http.get(UrlHelpers.join(restURL, DockerRegistry.SEARCH_FRAGMENT)).success(function (data) {
                callback(restURL, data);
            }).error(function (data) {
                DockerRegistry.log.debug("Error fetching image repositories:", data);
                callback(restURL, null);
            });
        });
    }
    DockerRegistry.getDockerImageRepositories = getDockerImageRepositories;
    function completeDockerRegistry() {
        var $q = HawtioCore.injector.get("$q");
        var $rootScope = HawtioCore.injector.get("$rootScope");
        var deferred = $q.defer();
        getDockerImageRepositories(function (restURL, repositories) {
            if (repositories && repositories.results) {
                // log.debug("Got back repositories: ", repositories);
                var results = repositories.results;
                results = results.sortBy(function (res) {
                    return res.name;
                }).first(15);
                var names = results.map(function (res) {
                    return res.name;
                });
                // log.debug("Results: ", names);
                deferred.resolve(names);
            }
            else {
                // log.debug("didn't get back anything, bailing");
                deferred.reject([]);
            }
        });
        return deferred.promise;
    }
    DockerRegistry.completeDockerRegistry = completeDockerRegistry;
})(DockerRegistry || (DockerRegistry = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="dockerRegistryHelpers.ts"/>
var DockerRegistry;
(function (DockerRegistry) {
    DockerRegistry._module = angular.module(DockerRegistry.pluginName, ['hawtio-core', 'ngResource']);
    DockerRegistry.controller = PluginHelpers.createControllerFunction(DockerRegistry._module, DockerRegistry.pluginName);
    DockerRegistry.route = PluginHelpers.createRoutingFunction(DockerRegistry.templatePath);
    DockerRegistry._module.config(['$routeProvider', function ($routeProvider) {
        $routeProvider.when(UrlHelpers.join(DockerRegistry.context, 'list'), DockerRegistry.route('list.html', false));
    }]);
    DockerRegistry._module.factory('DockerRegistryRestURL', ['jolokiaUrl', 'jolokia', '$q', '$rootScope', function (jolokiaUrl, jolokia, $q, $rootScope) {
        // TODO use the services plugin to find it?
        /*
            var answer = <ng.IDeferred<string>> $q.defer();
            jolokia.getAttribute(Kubernetes.managerMBean, 'DockerRegistry', undefined,
              <Jolokia.IParams> Core.onSuccess((response) => {
                var proxified = UrlHelpers.maybeProxy(jolokiaUrl, response);
                log.debug("Discovered docker registry API URL: " , proxified);
                answer.resolve(proxified);
                Core.$apply($rootScope);
              }, {
                error: (response) => {
                  log.debug("error fetching docker registry API details: ", response);
                  answer.reject(response);
                  Core.$apply($rootScope);
                }
              }));
            return answer.promise;
        */
    }]);
    DockerRegistry._module.run(['viewRegistry', 'workspace', function (viewRegistry, workspace) {
        DockerRegistry.log.debug("Running");
        viewRegistry['docker-registry'] = UrlHelpers.join(DockerRegistry.templatePath, 'layoutDockerRegistry.html');
        /* TODO commenting this out until we fix the above service :-)
        workspace.topLevelTabs.push({
          id: 'docker-registry',
          content: 'Images',
          isValid: (workspace:Core.Workspace) => true, // TODO workspace.treeContainsDomainAndProperties(Fabric.jmxDomain, { type: 'KubernetesManager' }),
          isActive: (workspace:Core.Workspace) => workspace.isLinkActive('docker-registry'),
          href: () => defaultRoute
        });
        */
    }]);
    hawtioPluginLoader.addModule(DockerRegistry.pluginName);
})(DockerRegistry || (DockerRegistry = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="dockerRegistryHelpers.ts"/>
/// <reference path="dockerRegistryPlugin.ts"/>
var DockerRegistry;
(function (DockerRegistry) {
    DockerRegistry.TopLevel = DockerRegistry.controller("TopLevel", ["$scope", "$http", "$timeout", function ($scope, $http, $timeout) {
        $scope.repositories = [];
        $scope.fetched = false;
        $scope.restURL = '';
        DockerRegistry.getDockerImageRepositories(function (restURL, repositories) {
            $scope.restURL = restURL;
            $scope.fetched = true;
            if (repositories) {
                $scope.repositories = repositories.results;
                var previous = angular.toJson($scope.repositories);
                $scope.fetch = PollHelpers.setupPolling($scope, function (next) {
                    var searchURL = UrlHelpers.join($scope.restURL, DockerRegistry.SEARCH_FRAGMENT);
                    $http.get(searchURL).success(function (repositories) {
                        if (repositories && repositories.results) {
                            if (previous !== angular.toJson(repositories.results)) {
                                $scope.repositories = repositories.results;
                                previous = angular.toJson($scope.repositories);
                            }
                        }
                        next();
                    });
                });
                $scope.fetch();
            }
            else {
                DockerRegistry.log.debug("Failed initial fetch of image repositories");
            }
        });
        $scope.$watchCollection('repositories', function (repositories) {
            if (!Core.isBlank($scope.restURL)) {
                if (!repositories || repositories.length === 0) {
                    $scope.$broadcast("DockerRegistry.Repositories", $scope.restURL, repositories);
                    return;
                }
                // we've a new list of repositories, let's refresh our info on 'em
                var outstanding = repositories.length;
                function maybeNotify() {
                    outstanding = outstanding - 1;
                    if (outstanding <= 0) {
                        $scope.$broadcast("DockerRegistry.Repositories", $scope.restURL, repositories);
                    }
                }
                repositories.forEach(function (repository) {
                    var tagURL = UrlHelpers.join($scope.restURL, 'v1/repositories/' + repository.name + '/tags');
                    // we'll give it half a second as sometimes tag info isn't instantly available
                    $timeout(function () {
                        DockerRegistry.log.debug("Fetching tags from URL: ", tagURL);
                        $http.get(tagURL).success(function (tags) {
                            DockerRegistry.log.debug("Got tags: ", tags, " for image repository: ", repository.name);
                            repository.tags = tags;
                            maybeNotify();
                        }).error(function (data) {
                            DockerRegistry.log.debug("Error fetching data for image repository: ", repository.name, " error: ", data);
                            maybeNotify();
                        });
                    }, 500);
                });
            }
        });
    }]);
})(DockerRegistry || (DockerRegistry = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="dockerRegistryHelpers.ts"/>
/// <reference path="dockerRegistryPlugin.ts"/>
var DockerRegistry;
(function (DockerRegistry) {
    DockerRegistry.TagController = DockerRegistry.controller("TagController", ["$scope", function ($scope) {
        $scope.selectImage = function (imageID) {
            $scope.$emit("DockerRegistry.SelectedImageID", imageID);
        };
    }]);
    DockerRegistry.ListController = DockerRegistry.controller("ListController", ["$scope", "$templateCache", "$http", function ($scope, $templateCache, $http) {
        $scope.imageRepositories = [];
        $scope.selectedImage = undefined;
        $scope.tableConfig = {
            data: 'imageRepositories',
            showSelectionCheckbox: true,
            enableRowClickSelection: false,
            multiSelect: true,
            selectedItems: [],
            filterOptions: {
                filterText: ''
            },
            columnDefs: [
                { field: 'name', displayName: 'Name', defaultSort: true },
                { field: 'description', displayName: 'Description' },
                { field: 'tags', displayName: 'Tags', cellTemplate: $templateCache.get("tagsTemplate.html") }
            ]
        };
        $scope.deletePrompt = function (selectedRepositories) {
            UI.multiItemConfirmActionDialog({
                collection: selectedRepositories,
                index: 'name',
                onClose: function (result) {
                    if (result) {
                        selectedRepositories.forEach(function (repository) {
                            var deleteURL = UrlHelpers.join($scope.restURL, '/v1/repositories/' + repository.name + '/');
                            DockerRegistry.log.debug("Using URL: ", deleteURL);
                            $http.delete(deleteURL).success(function (data) {
                                DockerRegistry.log.debug("Deleted repository: ", repository.name);
                            }).error(function (data) {
                                DockerRegistry.log.debug("Failed to delete repository: ", repository.name);
                            });
                        });
                    }
                },
                title: 'Delete Repositories?',
                action: 'The following repositories will be deleted:',
                okText: 'Delete',
                okClass: 'btn-danger',
                custom: 'This operation is permanent once completed!',
                customClass: 'alert alert-warning'
            }).open();
        };
        $scope.$on("DockerRegistry.SelectedImageID", function ($event, imageID) {
            var imageJsonURL = UrlHelpers.join($scope.restURL, '/v1/images/' + imageID + '/json');
            $http.get(imageJsonURL).success(function (image) {
                DockerRegistry.log.debug("Got image: ", image);
                $scope.selectedImage = image;
            });
        });
        $scope.$on('DockerRegistry.Repositories', function ($event, restURL, repositories) {
            $scope.imageRepositories = repositories;
        });
    }]);
})(DockerRegistry || (DockerRegistry = {}));

/**
 * @module Git
 */
var Git;
(function (Git) {
    function createGitRepository(workspace, jolokia, localStorage) {
        var mbean = getGitMBean(workspace);
        if (mbean && jolokia) {
            return new Git.JolokiaGit(mbean, jolokia, localStorage, workspace.userDetails);
        }
        // TODO use local storage to make a little wiki thingy?
        return null;
    }
    Git.createGitRepository = createGitRepository;
    Git.jmxDomain = "hawtio";
    Git.mbeanType = "GitFacade";
    function hasGit(workspace) {
        return getGitMBean(workspace) !== null;
    }
    Git.hasGit = hasGit;
    /**
     * Returns the JMX ObjectName of the git mbean
     * @method getGitMBean
     * @for Git
     * @param {Workspace} workspace
     * @return {String}
     */
    function getGitMBean(workspace) {
        return Core.getMBeanTypeObjectName(workspace, Git.jmxDomain, Git.mbeanType);
    }
    Git.getGitMBean = getGitMBean;
    /**
     * Returns the Folder for the git mbean if it can be found
     * @method getGitMBeanFolder
     * @for Git
     * @param {Workspace} workspace
     * @return {Folder}
     */
    function getGitMBeanFolder(workspace) {
        return Core.getMBeanTypeFolder(workspace, Git.jmxDomain, Git.mbeanType);
    }
    Git.getGitMBeanFolder = getGitMBeanFolder;
    /**
     * Returns true if the git mbean is a fabric configuration repository
     * (so we can use it for the fabric plugin)
     * @method isGitMBeanFabric
     * @for Git
     * @param {Workspace} workspace
     * @return {Boolean}
     */
    function isGitMBeanFabric(workspace) {
        var folder = getGitMBeanFolder(workspace);
        return folder && folder.entries["repo"] === "fabric";
    }
    Git.isGitMBeanFabric = isGitMBeanFabric;
})(Git || (Git = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="gitHelpers.ts"/>
/**
 * @module Git
 * @main Git
 */
var Git;
(function (Git) {
    /**
     * A default implementation which uses jolokia and the
     * GitFacadeMXBean over JMX
     *
     * @class JolokiaGit
     * @uses GitRepository
     *
     */
    var JolokiaGit = (function () {
        function JolokiaGit(mbean, jolokia, localStorage, userDetails, branch) {
            if (branch === void 0) { branch = "master"; }
            this.mbean = mbean;
            this.jolokia = jolokia;
            this.localStorage = localStorage;
            this.userDetails = userDetails;
            this.branch = branch;
        }
        JolokiaGit.prototype.getRepositoryLabel = function (fn, error) {
            return this.jolokia.request({ type: "read", mbean: this.mbean, attribute: ["RepositoryLabel"] }, Core.onSuccess(function (result) {
                fn(result.value.RepositoryLabel);
            }, { error: error }));
        };
        JolokiaGit.prototype.exists = function (branch, path, fn) {
            var result;
            if (angular.isDefined(fn) && fn) {
                result = this.jolokia.execute(this.mbean, "exists", branch, path, Core.onSuccess(fn));
            }
            else {
                result = this.jolokia.execute(this.mbean, "exists", branch, path);
            }
            if (angular.isDefined(result) && result) {
                return true;
            }
            else {
                return false;
            }
        };
        JolokiaGit.prototype.read = function (branch, path, fn) {
            return this.jolokia.execute(this.mbean, "read", branch, path, Core.onSuccess(fn));
        };
        JolokiaGit.prototype.write = function (branch, path, commitMessage, contents, fn) {
            var authorName = this.getUserName();
            var authorEmail = this.getUserEmail();
            return this.jolokia.execute(this.mbean, "write", branch, path, commitMessage, authorName, authorEmail, contents, Core.onSuccess(fn));
        };
        JolokiaGit.prototype.writeBase64 = function (branch, path, commitMessage, contents, fn) {
            var authorName = this.getUserName();
            var authorEmail = this.getUserEmail();
            return this.jolokia.execute(this.mbean, "writeBase64", branch, path, commitMessage, authorName, authorEmail, contents, Core.onSuccess(fn));
        };
        JolokiaGit.prototype.createDirectory = function (branch, path, commitMessage, fn) {
            var authorName = this.getUserName();
            var authorEmail = this.getUserEmail();
            return this.jolokia.execute(this.mbean, "createDirectory", branch, path, commitMessage, authorName, authorEmail, Core.onSuccess(fn));
        };
        JolokiaGit.prototype.revertTo = function (branch, objectId, blobPath, commitMessage, fn) {
            var authorName = this.getUserName();
            var authorEmail = this.getUserEmail();
            return this.jolokia.execute(this.mbean, "revertTo", branch, objectId, blobPath, commitMessage, authorName, authorEmail, Core.onSuccess(fn));
        };
        JolokiaGit.prototype.rename = function (branch, oldPath, newPath, commitMessage, fn) {
            var authorName = this.getUserName();
            var authorEmail = this.getUserEmail();
            return this.jolokia.execute(this.mbean, "rename", branch, oldPath, newPath, commitMessage, authorName, authorEmail, Core.onSuccess(fn));
        };
        JolokiaGit.prototype.remove = function (branch, path, commitMessage, fn) {
            var authorName = this.getUserName();
            var authorEmail = this.getUserEmail();
            return this.jolokia.execute(this.mbean, "remove", branch, path, commitMessage, authorName, authorEmail, Core.onSuccess(fn));
        };
        JolokiaGit.prototype.completePath = function (branch, completionText, directoriesOnly, fn) {
            return this.jolokia.execute(this.mbean, "completePath", branch, completionText, directoriesOnly, Core.onSuccess(fn));
        };
        JolokiaGit.prototype.history = function (branch, objectId, path, limit, fn) {
            return this.jolokia.execute(this.mbean, "history", branch, objectId, path, limit, Core.onSuccess(fn));
        };
        JolokiaGit.prototype.commitTree = function (commitId, fn) {
            return this.jolokia.execute(this.mbean, "getCommitTree", commitId, Core.onSuccess(fn));
        };
        JolokiaGit.prototype.commitInfo = function (commitId, fn) {
            return this.jolokia.execute(this.mbean, "getCommitInfo", commitId, Core.onSuccess(fn));
        };
        JolokiaGit.prototype.diff = function (objectId, baseObjectId, path, fn) {
            return this.jolokia.execute(this.mbean, "diff", objectId, baseObjectId, path, Core.onSuccess(fn));
        };
        JolokiaGit.prototype.getContent = function (objectId, blobPath, fn) {
            return this.jolokia.execute(this.mbean, "getContent", objectId, blobPath, Core.onSuccess(fn));
        };
        JolokiaGit.prototype.readJsonChildContent = function (path, nameWildcard, search, fn) {
            return this.jolokia.execute(this.mbean, "readJsonChildContent", this.branch, path, nameWildcard, search, Core.onSuccess(fn));
        };
        JolokiaGit.prototype.branches = function (fn) {
            return this.jolokia.execute(this.mbean, "branches", Core.onSuccess(fn));
        };
        // TODO move...
        JolokiaGit.prototype.getUserName = function () {
            return this.localStorage["gitUserName"] || this.userDetails.username || "anonymous";
        };
        JolokiaGit.prototype.getUserEmail = function () {
            return this.localStorage["gitUserEmail"] || "anonymous@gmail.com";
        };
        return JolokiaGit;
    })();
    Git.JolokiaGit = JolokiaGit;
})(Git || (Git = {}));

/// <reference path="../../includes.ts"/>
/**
 * @module Dozer
 * @main Dozer
 */
var Dozer;
(function (Dozer) {
    /**
     * The JMX domain for Dozer
     * @property jmxDomain
     * @for Dozer
     * @type String
     */
    Dozer.jmxDomain = 'net.sourceforge.dozer';
    Dozer.introspectorMBean = "hawtio:type=Introspector";
    /**
     * Don't try and load properties for these types
     * @property excludedPackages
     * @for Dozer
     * @type {Array}
     */
    Dozer.excludedPackages = [
        'java.lang',
        'int',
        'double',
        'long'
    ];
    /**
     * Lets map the class names to element names
     * @property elementNameMappings
     * @for Dozer
     * @type {Array}
     */
    Dozer.elementNameMappings = {
        "Mapping": "mapping",
        "MappingClass": "class",
        "Field": "field"
    };
    Dozer.log = Logger.get("Dozer");
    /**
     * Converts the XML string or DOM node to a Dozer model
     * @method loadDozerModel
     * @for Dozer
     * @static
     * @param {Object} xml
     * @param {String} pageId
     * @return {Mappings}
     */
    function loadDozerModel(xml, pageId) {
        var doc = xml;
        if (angular.isString(xml)) {
            doc = $.parseXML(xml);
        }
        console.log("Has Dozer XML document: " + doc);
        var model = new Dozer.Mappings(doc);
        var mappingsElement = doc.documentElement;
        copyAttributes(model, mappingsElement);
        $(mappingsElement).children("mapping").each(function (idx, element) {
            var mapping = createMapping(element);
            model.mappings.push(mapping);
        });
        return model;
    }
    Dozer.loadDozerModel = loadDozerModel;
    function saveToXmlText(model) {
        // lets copy the original doc then replace the mapping elements
        var element = model.doc.documentElement.cloneNode(false);
        appendElement(model.mappings, element, null, 1);
        Dozer.addTextNode(element, "\n");
        var xmlText = Core.xmlNodeToString(element);
        return '<?xml version="1.0" encoding="UTF-8"?>\n' + xmlText;
    }
    Dozer.saveToXmlText = saveToXmlText;
    function findUnmappedFields(workspace, mapping, fn) {
        // lets find the fields which are unmapped
        var className = mapping.class_a.value;
        findProperties(workspace, className, null, function (properties) {
            var answer = [];
            angular.forEach(properties, function (property) {
                console.log("got property " + JSON.stringify(property, null, "  "));
                var name = property.name;
                if (name) {
                    if (mapping.hasFromField(name)) {
                    }
                    else {
                        // TODO auto-detect this property name in the to classes?
                        answer.push(new Dozer.UnmappedField(name, property));
                    }
                }
            });
            fn(answer);
        });
    }
    Dozer.findUnmappedFields = findUnmappedFields;
    /**
     * Finds the properties on the given class and returns them; and either invokes the given function
     * or does a sync request and returns them
     * @method findProperties
     * @for Dozer
     * @static
     * @param {Core.Workspace} workspace
     * @param {String} className
     * @param {String} filter
     * @param {Function} fn
     * @return {any}
     */
    function findProperties(workspace, className, filter, fn) {
        if (filter === void 0) { filter = null; }
        if (fn === void 0) { fn = null; }
        var mbean = getIntrospectorMBean(workspace);
        if (mbean) {
            if (filter) {
                return workspace.jolokia.execute(mbean, "findProperties", className, filter, Core.onSuccess(fn));
            }
            else {
                return workspace.jolokia.execute(mbean, "getProperties", className, Core.onSuccess(fn));
            }
        }
        else {
            if (fn) {
                return fn([]);
            }
            else {
                return [];
            }
        }
    }
    Dozer.findProperties = findProperties;
    /**
     * Finds class names matching the given search text and either invokes the function with the results
     * or does a sync request and returns them.
     * @method findClassNames
     * @for Dozer
     * @static
     * @param {Core.Workspace} workspace
     * @param {String} searchText
     * @param {Number} limit @default 20
     * @param {Function} fn
     * @return {any}
     */
    function findClassNames(workspace, searchText, limit, fn) {
        if (limit === void 0) { limit = 20; }
        if (fn === void 0) { fn = null; }
        var mbean = getIntrospectorMBean(workspace);
        if (mbean) {
            return workspace.jolokia.execute(mbean, "findClassNames", searchText, limit, Core.onSuccess(fn));
        }
        else {
            if (fn) {
                return fn([]);
            }
            else {
                return [];
            }
        }
    }
    Dozer.findClassNames = findClassNames;
    function getIntrospectorMBean(workspace) {
        // lets hard code this so its easy to use in any JVM
        return Dozer.introspectorMBean;
        // return Core.getMBeanTypeObjectName(workspace, "hawtio", "Introspector");
    }
    Dozer.getIntrospectorMBean = getIntrospectorMBean;
    function loadModelFromTree(rootTreeNode, oldModel) {
        oldModel.mappings = [];
        angular.forEach(rootTreeNode.childList, function (treeNode) {
            var mapping = Core.pathGet(treeNode, ["data", "entity"]);
            if (mapping) {
                oldModel.mappings.push(mapping);
            }
        });
        return oldModel;
    }
    Dozer.loadModelFromTree = loadModelFromTree;
    function createDozerTree(model) {
        var id = "mappings";
        var folder = new Folder(id);
        folder.addClass = "net-sourceforge-dozer-mappings";
        folder.domain = Dozer.jmxDomain;
        folder.typeName = "mappings";
        folder.entity = model;
        folder.key = Core.toSafeDomID(id);
        angular.forEach(model.mappings, function (mapping) {
            var mappingFolder = createMappingFolder(mapping, folder);
            folder.children.push(mappingFolder);
        });
        return folder;
    }
    Dozer.createDozerTree = createDozerTree;
    function createMappingFolder(mapping, parentFolder) {
        var mappingName = mapping.name();
        var mappingFolder = new Folder(mappingName);
        mappingFolder.addClass = "net-sourceforge-dozer-mapping";
        mappingFolder.typeName = "mapping";
        mappingFolder.domain = Dozer.jmxDomain;
        mappingFolder.key = (parentFolder ? parentFolder.key + "_" : "") + Core.toSafeDomID(mappingName);
        mappingFolder.parent = parentFolder;
        mappingFolder.entity = mapping;
        mappingFolder.icon = Core.url("/plugins/dozer/img/class.gif");
        /*
              mappingFolder.tooltip = nodeSettings["tooltip"] || nodeSettings["description"] || id;
              */
        angular.forEach(mapping.fields, function (field) {
            addMappingFieldFolder(field, mappingFolder);
        });
        return mappingFolder;
    }
    Dozer.createMappingFolder = createMappingFolder;
    function addMappingFieldFolder(field, mappingFolder) {
        var name = field.name();
        var fieldFolder = new Folder(name);
        fieldFolder.addClass = "net-sourceforge-dozer-field";
        fieldFolder.typeName = "field";
        fieldFolder.domain = Dozer.jmxDomain;
        fieldFolder.key = mappingFolder.key + "_" + Core.toSafeDomID(name);
        fieldFolder.parent = mappingFolder;
        fieldFolder.entity = field;
        fieldFolder.icon = Core.url("/plugins/dozer/img/attribute.gif");
        /*
              fieldFolder.tooltip = nodeSettings["tooltip"] || nodeSettings["description"] || id;
              */
        mappingFolder.children.push(fieldFolder);
        return fieldFolder;
    }
    Dozer.addMappingFieldFolder = addMappingFieldFolder;
    function createMapping(element) {
        var mapping = new Dozer.Mapping();
        var elementJQ = $(element);
        mapping.class_a = createMappingClass(elementJQ.children("class-a"));
        mapping.class_b = createMappingClass(elementJQ.children("class-b"));
        elementJQ.children("field").each(function (idx, fieldElement) {
            var field = createField(fieldElement);
            mapping.fields.push(field);
        });
        copyAttributes(mapping, element);
        return mapping;
    }
    function createField(element) {
        if (element) {
            var jqe = $(element);
            var a = jqe.children("a").text();
            var b = jqe.children("b").text();
            var field = new Dozer.Field(new Dozer.FieldDefinition(a), new Dozer.FieldDefinition(b));
            copyAttributes(field, element);
            return field;
        }
        return new Dozer.Field(new Dozer.FieldDefinition(""), new Dozer.FieldDefinition(""));
    }
    function createMappingClass(jqElement) {
        if (jqElement && jqElement[0]) {
            var element = jqElement[0];
            var text = element.textContent;
            if (text) {
                var mappingClass = new Dozer.MappingClass(text);
                copyAttributes(mappingClass, element);
                return mappingClass;
            }
        }
        // lets create a default empty mapping
        return new Dozer.MappingClass("");
    }
    function copyAttributes(object, element) {
        var attributeMap = element.attributes;
        for (var i = 0; i < attributeMap.length; i++) {
            // TODO hacky work around for compiler issue ;)
            //var attr = attributeMap.item(i);
            var attMap = attributeMap;
            var attr = attMap.item(i);
            if (attr) {
                var name = attr.localName;
                var value = attr.value;
                if (name && !name.startsWith("xmlns")) {
                    var safeName = Forms.safeIdentifier(name);
                    object[safeName] = value;
                }
            }
        }
    }
    function appendAttributes(object, element, ignorePropertyNames) {
        angular.forEach(object, function (value, key) {
            if (ignorePropertyNames.any(key)) {
            }
            else {
                // lets add an attribute value
                if (value) {
                    var text = value.toString();
                    // lets replace any underscores with dashes
                    var name = key.replace(/_/g, '-');
                    element.setAttribute(name, text);
                }
            }
        });
    }
    Dozer.appendAttributes = appendAttributes;
    /**
     * Adds a new child element for this mapping to the given element
     * @method appendElement
     * @for Dozer
     * @static
     * @param {any} object
     * @param {any} element
     * @param {String} elementName
     * @param {Number} indentLevel
     * @return the last child element created
     */
    function appendElement(object, element, elementName, indentLevel) {
        if (elementName === void 0) { elementName = null; }
        if (indentLevel === void 0) { indentLevel = 0; }
        var answer = null;
        if (angular.isArray(object)) {
            angular.forEach(object, function (child) {
                answer = appendElement(child, element, elementName, indentLevel);
            });
        }
        else if (object) {
            if (!elementName) {
                var className = Core.pathGet(object, ["constructor", "name"]);
                if (!className) {
                    console.log("WARNING: no class name for value " + object);
                }
                else {
                    elementName = Dozer.elementNameMappings[className];
                    if (!elementName) {
                        console.log("WARNING: could not map class name " + className + " to an XML element name");
                    }
                }
            }
            if (elementName) {
                if (indentLevel) {
                    var text = indentText(indentLevel);
                    Dozer.addTextNode(element, text);
                }
                var doc = element.ownerDocument || document;
                var child = doc.createElement(elementName);
                // navigate child properties...
                var fn = object.saveToElement;
                if (fn) {
                    fn.apply(object, [child]);
                }
                else {
                    angular.forEach(object, function (value, key) {
                        console.log("has key " + key + " value " + value);
                    });
                }
                // if we have any element children then add newline text node
                if ($(child).children().length) {
                    //var text = indentText(indentLevel - 1);
                    var text = indentText(indentLevel);
                    Dozer.addTextNode(child, text);
                }
                element.appendChild(child);
                answer = child;
            }
        }
        return answer;
    }
    Dozer.appendElement = appendElement;
    function nameOf(object) {
        var text = angular.isObject(object) ? object["value"] : null;
        if (!text && angular.isString(object)) {
            text = object;
        }
        return text || "?";
    }
    Dozer.nameOf = nameOf;
    function addTextNode(element, text) {
        if (text) {
            var doc = element.ownerDocument || document;
            var child = doc.createTextNode(text);
            element.appendChild(child);
        }
    }
    Dozer.addTextNode = addTextNode;
    function indentText(indentLevel) {
        var text = "\n";
        for (var i = 0; i < indentLevel; i++) {
            text += "  ";
        }
        return text;
    }
})(Dozer || (Dozer = {}));

/// <reference path="../../includes.ts"/>
/**
 * @module Dozer
 */
var Dozer;
(function (Dozer) {
    /**
     * @class Mappings
     */
    var Mappings = (function () {
        function Mappings(doc, mappings) {
            if (mappings === void 0) { mappings = []; }
            this.doc = doc;
            this.mappings = mappings;
        }
        return Mappings;
    })();
    Dozer.Mappings = Mappings;
    /**
     * @class Mapping
     */
    var Mapping = (function () {
        function Mapping() {
            this.fields = [];
            this.map_id = Core.getUUID();
            this.class_a = new MappingClass('');
            this.class_b = new MappingClass('');
        }
        Mapping.prototype.name = function () {
            return Dozer.nameOf(this.class_a) + " -> " + Dozer.nameOf(this.class_b);
        };
        Mapping.prototype.hasFromField = function (name) {
            return this.fields.find(function (f) { return name === f.a.value; });
        };
        Mapping.prototype.hasToField = function (name) {
            return this.fields.find(function (f) { return name === f.b.value; });
        };
        Mapping.prototype.saveToElement = function (element) {
            Dozer.appendElement(this.class_a, element, "class-a", 2);
            Dozer.appendElement(this.class_b, element, "class-b", 2);
            Dozer.appendElement(this.fields, element, "field", 2);
            Dozer.appendAttributes(this, element, ["class_a", "class_b", "fields"]);
        };
        return Mapping;
    })();
    Dozer.Mapping = Mapping;
    /**
     * @class MappingClass
     */
    var MappingClass = (function () {
        function MappingClass(value) {
            this.value = value;
        }
        MappingClass.prototype.saveToElement = function (element) {
            Dozer.addTextNode(element, this.value);
            Dozer.appendAttributes(this, element, ["value", "properties", "error"]);
        };
        return MappingClass;
    })();
    Dozer.MappingClass = MappingClass;
    /**
     * @class Field
     */
    var Field = (function () {
        function Field(a, b) {
            this.a = a;
            this.b = b;
        }
        Field.prototype.name = function () {
            return Dozer.nameOf(this.a) + " -> " + Dozer.nameOf(this.b);
        };
        Field.prototype.saveToElement = function (element) {
            Dozer.appendElement(this.a, element, "a", 3);
            Dozer.appendElement(this.b, element, "b", 3);
            Dozer.appendAttributes(this, element, ["a", "b"]);
        };
        return Field;
    })();
    Dozer.Field = Field;
    /**
     * @class FieldDefinition
     */
    var FieldDefinition = (function () {
        function FieldDefinition(value) {
            this.value = value;
        }
        FieldDefinition.prototype.saveToElement = function (element) {
            Dozer.addTextNode(element, this.value);
            Dozer.appendAttributes(this, element, ["value", "properties", "error"]);
        };
        return FieldDefinition;
    })();
    Dozer.FieldDefinition = FieldDefinition;
    /**
     * @class UnmappedField
     */
    var UnmappedField = (function () {
        function UnmappedField(fromField, property, toField) {
            if (toField === void 0) { toField = null; }
            this.fromField = fromField;
            this.property = property;
            this.toField = toField;
        }
        return UnmappedField;
    })();
    Dozer.UnmappedField = UnmappedField;
})(Dozer || (Dozer = {}));

/// <reference path="../../includes.ts"/>
/**
 * @module Dozer
 */
var Dozer;
(function (Dozer) {
    /**
     * Configures the JSON schemas to improve the UI models
     * @method schemaConfigure
     * @for Dozer
     */
    function schemaConfigure() {
        Dozer.io_hawt_dozer_schema_Field["tabs"] = {
            'Fields': ['a.value', 'b.value'],
            'From Field': ['a\\..*'],
            'To Field': ['b\\..*'],
            'Field Configuration': ['*']
        };
        Dozer.io_hawt_dozer_schema_Mapping["tabs"] = {
            'Classes': ['class-a.value', 'class-b.value'],
            'From Class': ['class-a\\..*'],
            'To Class': ['class-b\\..*'],
            'Class Configuration': ['*']
        };
        // hide the fields table from the class configuration tab
        Dozer.io_hawt_dozer_schema_Mapping.properties.fieldOrFieldExclude.hidden = true;
        Core.pathSet(Dozer.io_hawt_dozer_schema_Field, ["properties", "a", "properties", "value", "label"], "From Field");
        Core.pathSet(Dozer.io_hawt_dozer_schema_Field, ["properties", "b", "properties", "value", "label"], "To Field");
        Core.pathSet(Dozer.io_hawt_dozer_schema_Mapping, ["properties", "class-a", "properties", "value", "label"], "From Class");
        Core.pathSet(Dozer.io_hawt_dozer_schema_Mapping, ["properties", "class-b", "properties", "value", "label"], "To Class");
        // ignore prefixes in the generated labels
        Core.pathSet(Dozer.io_hawt_dozer_schema_Field, ["properties", "a", "ignorePrefixInLabel"], true);
        Core.pathSet(Dozer.io_hawt_dozer_schema_Field, ["properties", "b", "ignorePrefixInLabel"], true);
        Core.pathSet(Dozer.io_hawt_dozer_schema_Mapping, ["properties", "class-a", "ignorePrefixInLabel"], true);
        Core.pathSet(Dozer.io_hawt_dozer_schema_Mapping, ["properties", "class-b", "ignorePrefixInLabel"], true);
        // add custom widgets
        Core.pathSet(Dozer.io_hawt_dozer_schema_Mapping, ["properties", "class-a", "properties", "value", "formTemplate"], classNameWidget("class_a"));
        Core.pathSet(Dozer.io_hawt_dozer_schema_Mapping, ["properties", "class-b", "properties", "value", "formTemplate"], classNameWidget("class_b"));
        Core.pathSet(Dozer.io_hawt_dozer_schema_Field, ["properties", "a", "properties", "value", "formTemplate"], '<input type="text" ng-model="dozerEntity.a.value" ' + 'typeahead="title for title in fromFieldNames($viewValue) | filter:$viewValue" ' + 'typeahead-editable="true"  title="The Java class name"/>');
        Core.pathSet(Dozer.io_hawt_dozer_schema_Field, ["properties", "b", "properties", "value", "formTemplate"], '<input type="text" ng-model="dozerEntity.b.value" ' + 'typeahead="title for title in toFieldNames($viewValue) | filter:$viewValue" ' + 'typeahead-editable="true"  title="The Java class name"/>');
        function classNameWidget(propertyName) {
            return '<input type="text" ng-model="dozerEntity.' + propertyName + '.value" ' + 'typeahead="title for title in classNames($viewValue) | filter:$viewValue" ' + 'typeahead-editable="true"  title="The Java class name"/>';
        }
    }
    Dozer.schemaConfigure = schemaConfigure;
})(Dozer || (Dozer = {}));

/// <reference path="../../includes.ts"/>
/**
 * @module Maven
 */
var Maven;
(function (Maven) {
    Maven.log = Logger.get("Maven");
    /**
     * Returns the maven indexer mbean (from the hawtio-maven-indexer library)
     * @method getMavenIndexerMBean
     * @for Maven
     * @param {Core.Workspace} workspace
     * @return {String}
     */
    function getMavenIndexerMBean(workspace) {
        if (workspace) {
            var mavenStuff = workspace.mbeanTypesToDomain["Indexer"] || {};
            var object = mavenStuff["hawtio"] || {};
            return object.objectName;
        }
        else
            return null;
    }
    Maven.getMavenIndexerMBean = getMavenIndexerMBean;
    function getAetherMBean(workspace) {
        if (workspace) {
            var mavenStuff = workspace.mbeanTypesToDomain["AetherFacade"] || {};
            var object = mavenStuff["hawtio"] || {};
            return object.objectName;
        }
        else
            return null;
    }
    Maven.getAetherMBean = getAetherMBean;
    function mavenLink(url) {
        var path = null;
        if (url) {
            if (url.startsWith("mvn:")) {
                path = url.substring(4);
            }
            else {
                var idx = url.indexOf(":mvn:");
                if (idx > 0) {
                    path = url.substring(idx + 5);
                }
            }
        }
        return path ? "#/maven/artifact/" + path : null;
    }
    Maven.mavenLink = mavenLink;
    function getName(row) {
        var id = (row.group || row.groupId) + "/" + (row.artifact || row.artifactId);
        if (row.version) {
            id += "/" + row.version;
        }
        if (row.classifier) {
            id += "/" + row.classifier;
        }
        if (row.packaging) {
            id += "/" + row.packaging;
        }
        return id;
    }
    Maven.getName = getName;
    function completeMavenUri($q, $scope, workspace, jolokia, query) {
        var mbean = getMavenIndexerMBean(workspace);
        if (!angular.isDefined(mbean)) {
            return $q.when([]);
        }
        var parts = query.split('/');
        if (parts.length === 1) {
            // still searching the groupId
            return Maven.completeGroupId(mbean, $q, $scope, workspace, jolokia, query, null, null);
        }
        if (parts.length === 2) {
            // have the groupId, guess we're looking for the artifactId
            return Maven.completeArtifactId(mbean, $q, $scope, workspace, jolokia, parts[0], parts[1], null, null);
        }
        if (parts.length === 3) {
            // guess we're searching for the version
            return Maven.completeVersion(mbean, $q, $scope, workspace, jolokia, parts[0], parts[1], parts[2], null, null);
        }
        return $q.when([]);
    }
    Maven.completeMavenUri = completeMavenUri;
    function completeVersion(mbean, $q, $scope, workspace, jolokia, groupId, artifactId, partial, packaging, classifier) {
        /*
        if (partial.length < 5) {
          return $q.when([]);
        }
        */
        var deferred = $q.defer();
        jolokia.request({
            type: 'exec',
            mbean: mbean,
            operation: 'versionComplete(java.lang.String, java.lang.String, java.lang.String, java.lang.String, java.lang.String)',
            arguments: [groupId, artifactId, partial, packaging, classifier]
        }, {
            method: 'POST',
            success: function (response) {
                $scope.$apply(function () {
                    deferred.resolve(response.value.sortBy().first(15));
                });
            },
            error: function (response) {
                $scope.$apply(function () {
                    console.log("got back an error: ", response);
                    deferred.reject();
                });
            }
        });
        return deferred.promise;
    }
    Maven.completeVersion = completeVersion;
    function completeArtifactId(mbean, $q, $scope, workspace, jolokia, groupId, partial, packaging, classifier) {
        var deferred = $q.defer();
        jolokia.request({
            type: 'exec',
            mbean: mbean,
            operation: 'artifactIdComplete(java.lang.String, java.lang.String, java.lang.String, java.lang.String)',
            arguments: [groupId, partial, packaging, classifier]
        }, {
            method: 'POST',
            success: function (response) {
                $scope.$apply(function () {
                    deferred.resolve(response.value.sortBy().first(15));
                });
            },
            error: function (response) {
                $scope.$apply(function () {
                    console.log("got back an error: ", response);
                    deferred.reject();
                });
            }
        });
        return deferred.promise;
    }
    Maven.completeArtifactId = completeArtifactId;
    function completeGroupId(mbean, $q, $scope, workspace, jolokia, partial, packaging, classifier) {
        // let's go easy on the indexer
        if (partial.length < 5) {
            return $q.when([]);
        }
        var deferred = $q.defer();
        jolokia.request({
            type: 'exec',
            mbean: mbean,
            operation: 'groupIdComplete(java.lang.String, java.lang.String, java.lang.String)',
            arguments: [partial, packaging, classifier]
        }, {
            method: 'POST',
            success: function (response) {
                $scope.$apply(function () {
                    deferred.resolve(response.value.sortBy().first(15));
                });
            },
            error: function (response) {
                console.log("got back an error: ", response);
                $scope.$apply(function () {
                    deferred.reject();
                });
            }
        });
        return deferred.promise;
    }
    Maven.completeGroupId = completeGroupId;
    function addMavenFunctions($scope, workspace) {
        $scope.detailLink = function (row) {
            var group = row.groupId;
            var artifact = row.artifactId;
            var version = row.version || "";
            var classifier = row.classifier || "";
            var packaging = row.packaging || "";
            if (group && artifact) {
                return "#/maven/artifact/" + group + "/" + artifact + "/" + version + "/" + classifier + "/" + packaging;
            }
            return "";
        };
        $scope.javadocLink = function (row) {
            var group = row.groupId;
            var artifact = row.artifactId;
            var version = row.version;
            if (group && artifact && version) {
                return "javadoc/" + group + ":" + artifact + ":" + version + "/";
            }
            return "";
        };
        $scope.versionsLink = function (row) {
            var group = row.groupId;
            var artifact = row.artifactId;
            var classifier = row.classifier || "";
            var packaging = row.packaging || "";
            if (group && artifact) {
                return "#/maven/versions/" + group + "/" + artifact + "/" + classifier + "/" + packaging;
            }
            return "";
        };
        $scope.dependenciesLink = function (row) {
            var group = row.groupId;
            var artifact = row.artifactId;
            var classifier = row.classifier || "";
            var packaging = row.packaging || "";
            var version = row.version;
            if (group && artifact) {
                return "#/maven/dependencies/" + group + "/" + artifact + "/" + version + "/" + classifier + "/" + packaging;
            }
            return "";
        };
        $scope.hasDependencyMBean = function () {
            var mbean = Maven.getAetherMBean(workspace);
            return angular.isDefined(mbean);
        };
        $scope.sourceLink = function (row) {
            var group = row.groupId;
            var artifact = row.artifactId;
            var version = row.version;
            if (group && artifact && version) {
                return "#/source/index/" + group + ":" + artifact + ":" + version + "/";
            }
            return "";
        };
    }
    Maven.addMavenFunctions = addMavenFunctions;
})(Maven || (Maven = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="mavenHelpers.ts"/>
/**
 * @module Maven
 * @main Maven
 */
var Maven;
(function (Maven) {
    var pluginName = 'maven';
    Maven._module = angular.module(pluginName, ['ngResource', 'datatable', 'tree', 'hawtio-core', 'hawtio-ui']);
    //export var _module = angular.module(pluginName, ['bootstrap', 'ngResource', 'datatable', 'tree', 'hawtio-core', 'hawtio-ui']);
    Maven._module.config(["$routeProvider", function ($routeProvider) {
        $routeProvider.when('/maven', { redirectTo: '/maven/search' }).when('/maven/search', { templateUrl: 'plugins/maven/html/search.html' }).when('/maven/advancedSearch', { templateUrl: 'plugins/maven/html/advancedSearch.html' }).when('/maven/artifact/:group/:artifact/:version/:classifier/:packaging', { templateUrl: 'plugins/maven/html/artifact.html' }).when('/maven/artifact/:group/:artifact/:version/:classifier', { templateUrl: 'plugins/maven/html/artifact.html' }).when('/maven/artifact/:group/:artifact/:version', { templateUrl: 'plugins/maven/html/artifact.html' }).when('/maven/dependencies/:group/:artifact/:version/:classifier/:packaging', { templateUrl: 'plugins/maven/html/dependencies.html' }).when('/maven/dependencies/:group/:artifact/:version/:classifier', { templateUrl: 'plugins/maven/html/dependencies.html' }).when('/maven/dependencies/:group/:artifact/:version', { templateUrl: 'plugins/maven/html/dependencies.html' }).when('/maven/versions/:group/:artifact/:classifier/:packaging', { templateUrl: 'plugins/maven/html/versions.html' }).when('/maven/view/:group/:artifact/:version/:classifier/:packaging', { templateUrl: 'plugins/maven/html/view.html' }).when('/maven/test', { templateUrl: 'plugins/maven/html/test.html' });
    }]);
    Maven._module.run(["HawtioNav", "$location", "workspace", "viewRegistry", "helpRegistry", function (nav, $location, workspace, viewRegistry, helpRegistry) {
        //viewRegistry['maven'] = "plugins/maven/html/layoutMaven.html";
        var builder = nav.builder();
        var search = builder.id('maven-search').title(function () { return 'Search'; }).href(function () { return '/maven/search' + workspace.hash(); }).isSelected(function () { return workspace.isLinkPrefixActive('/maven/search'); }).build();
        var advanced = builder.id('maven-advanced-search').title(function () { return 'Advanced Search'; }).href(function () { return '/maven/advancedSearch' + workspace.hash(); }).isSelected(function () { return workspace.isLinkPrefixActive('/maven/advancedSearch'); }).build();
        var tab = builder.id('maven').title(function () { return 'Maven'; }).isValid(function () { return Maven.getMavenIndexerMBean(workspace); }).href(function () { return '/maven'; }).isSelected(function () { return workspace.isLinkActive('/maven'); }).tabs(search, advanced).build();
        nav.add(tab);
        /*
        workspace.topLevelTabs.push({
          id: "maven",
          content: "Maven",
          title: "Search maven repositories for artifacts",
          isValid: (workspace: Workspace) => Maven.getMavenIndexerMBean(workspace),
          href: () => "#/maven/search",
          isActive: (workspace: Workspace) => workspace.isLinkActive("/maven")
        });
        */
        helpRegistry.addUserDoc('maven', 'plugins/maven/doc/help.md', function () {
            return Maven.getMavenIndexerMBean(workspace) !== null;
        });
        helpRegistry.addDevDoc("maven", 'plugins/maven/doc/developer.md');
    }]);
    hawtioPluginLoader.addModule(pluginName);
})(Maven || (Maven = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="mavenPlugin.ts"/>
/**
 * @module Maven
 */
var Maven;
(function (Maven) {
    Maven._module.controller("Maven.ArtifactController", ["$scope", "$routeParams", "workspace", "jolokia", function ($scope, $routeParams, workspace, jolokia) {
        $scope.row = {
            groupId: $routeParams["group"] || "",
            artifactId: $routeParams["artifact"] || "",
            version: $routeParams["version"] || "",
            classifier: $routeParams["classifier"] || "",
            packaging: $routeParams["packaging"] || ""
        };
        var row = $scope.row;
        $scope.id = Maven.getName(row);
        Maven.addMavenFunctions($scope, workspace);
        $scope.$on("$routeChangeSuccess", function (event, current, previous) {
            // lets do this asynchronously to avoid Error: $digest already in progress
            setTimeout(updateTableContents, 50);
        });
        $scope.$watch('workspace.selection', function () {
            updateTableContents();
        });
        function updateTableContents() {
            var mbean = Maven.getMavenIndexerMBean(workspace);
            // lets query the name and description of the GAV
            if (mbean) {
                jolokia.execute(mbean, "search", row.groupId, row.artifactId, row.version, row.packaging, row.classifier, "", Core.onSuccess(render));
            }
            else {
                console.log("No MavenIndexerMBean!");
            }
        }
        function render(response) {
            if (response && response.length) {
                var first = response[0];
                row.name = first.name;
                row.description = first.description;
            }
            Core.$apply($scope);
        }
    }]);
})(Maven || (Maven = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="mavenPlugin.ts"/>
/**
 * @module Maven
 */
var Maven;
(function (Maven) {
    Maven._module.controller("Maven.DependenciesController", ["$scope", "$routeParams", "$location", "workspace", "jolokia", function ($scope, $routeParams, $location, workspace, jolokia) {
        $scope.artifacts = [];
        $scope.group = $routeParams["group"] || "";
        $scope.artifact = $routeParams["artifact"] || "";
        $scope.version = $routeParams["version"] || "";
        $scope.classifier = $routeParams["classifier"] || "";
        $scope.packaging = $routeParams["packaging"] || "";
        $scope.dependencyTree = null;
        Maven.addMavenFunctions($scope, workspace);
        $scope.$on("$routeChangeSuccess", function (event, current, previous) {
            // lets do this asynchronously to avoid Error: $digest already in progress
            setTimeout(updateTableContents, 50);
        });
        $scope.$watch('workspace.selection', function () {
            updateTableContents();
        });
        $scope.onSelectNode = function (node) {
            $scope.selected = node;
        };
        $scope.onRootNode = function (rootNode) {
            // process the rootNode
        };
        $scope.validSelection = function () {
            return $scope.selected && $scope.selected !== $scope.rootDependency;
        };
        $scope.viewDetails = function () {
            var dependency = Core.pathGet($scope.selected, ["dependency"]);
            var link = $scope.detailLink(dependency);
            if (link) {
                var path = Core.trimLeading(link, "#");
                console.log("going to view " + path);
                $location.path(path);
            }
        };
        function updateTableContents() {
            var mbean = Maven.getAetherMBean(workspace);
            if (mbean) {
                jolokia.execute(mbean, "resolveJson(java.lang.String,java.lang.String,java.lang.String,java.lang.String,java.lang.String)", $scope.group, $scope.artifact, $scope.version, $scope.packaging, $scope.classifier, Core.onSuccess(render));
            }
            else {
                console.log("No AetherMBean!");
            }
        }
        function render(response) {
            if (response) {
                var json = JSON.parse(response);
                if (json) {
                    //console.log("Found json: " + JSON.stringify(json, null, "  "));
                    $scope.dependencyTree = new Folder("Dependencies");
                    $scope.dependencyActivations = [];
                    addChildren($scope.dependencyTree, json);
                    $scope.dependencyActivations.reverse();
                    $scope.rootDependency = $scope.dependencyTree.children[0];
                }
            }
            Core.$apply($scope);
        }
        function addChildren(folder, dependency) {
            var name = Maven.getName(dependency);
            var node = new Folder(name);
            node.key = name.replace(/\//g, '_');
            node["dependency"] = dependency;
            $scope.dependencyActivations.push(node.key);
            /*
                  var imageUrl = Camel.getRouteNodeIcon(value);
                  node.icon = imageUrl;
                  //node.tooltip = tooltip;
            */
            folder.children.push(node);
            var children = dependency["children"];
            angular.forEach(children, function (child) {
                addChildren(node, child);
            });
        }
    }]);
})(Maven || (Maven = {}));

/// <reference path="mavenHelpers.ts"/>
/// <reference path="mavenPlugin.ts"/>
/**
 * @module Maven
 */
var Maven;
(function (Maven) {
    Maven._module.controller("Maven.PomXmlController", ["$scope", function ($scope) {
        $scope.mavenPomXml = "\n" + "  <dependency>\n" + "    <groupId>" + orBlank($scope.row.groupId) + "</groupId>\n" + "    <artifactId>" + orBlank($scope.row.artifactId) + "</artifactId>\n" + "    <version>" + orBlank($scope.row.version) + "</version>\n" + "  </dependency>\n";
        function orBlank(text) {
            return text || "";
        }
    }]);
})(Maven || (Maven = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="mavenPlugin.ts"/>
/**
 * @module Maven
 */
var Maven;
(function (Maven) {
    Maven._module.controller("Maven.SearchController", ["$scope", "$location", "workspace", "jolokia", function ($scope, $location, workspace, jolokia) {
        var log = Logger.get("Maven");
        $scope.artifacts = [];
        $scope.selected = [];
        $scope.done = false;
        $scope.inProgress = false;
        $scope.form = {
            searchText: ""
        };
        $scope.search = "";
        $scope.searchForm = 'plugins/maven/html/searchForm.html';
        Maven.addMavenFunctions($scope, workspace);
        var columnDefs = [
            {
                field: 'groupId',
                displayName: 'Group'
            },
            {
                field: 'artifactId',
                displayName: 'Artifact',
                cellTemplate: '<div class="ngCellText" title="Name: {{row.entity.name}}">{{row.entity.artifactId}}</div>'
            },
            {
                field: 'version',
                displayName: 'Version',
                cellTemplate: '<div class="ngCellText" title="Name: {{row.entity.name}}"><a ng-href="{{detailLink(row.entity)}}">{{row.entity.version}}</a</div>'
            }
        ];
        $scope.gridOptions = {
            data: 'artifacts',
            displayFooter: true,
            selectedItems: $scope.selected,
            selectWithCheckboxOnly: true,
            columnDefs: columnDefs,
            rowDetailTemplateId: "artifactDetailTemplate",
            filterOptions: {
                filterText: 'search'
            }
        };
        $scope.hasAdvancedSearch = function (form) {
            return form.searchGroup || form.searchArtifact || form.searchVersion || form.searchPackaging || form.searchClassifier || form.searchClassName;
        };
        $scope.doSearch = function () {
            $scope.done = false;
            $scope.inProgress = true;
            $scope.artifacts = [];
            // ensure ui is updated with search in progress...
            setTimeout(function () {
                Core.$apply($scope);
            }, 50);
            var mbean = Maven.getMavenIndexerMBean(workspace);
            var form = $scope.form;
            if (mbean) {
                var searchText = form.searchText;
                var kind = form.artifactType;
                if (kind) {
                    if (kind === "className") {
                        log.debug("Search for: " + form.searchText + " className");
                        jolokia.execute(mbean, "searchClasses", searchText, Core.onSuccess(render));
                    }
                    else {
                        var paths = kind.split('/');
                        var packaging = paths[0];
                        var classifier = paths[1];
                        log.debug("Search for: " + form.searchText + " packaging " + packaging + " classifier " + classifier);
                        jolokia.execute(mbean, "searchTextAndPackaging", searchText, packaging, classifier, Core.onSuccess(render));
                    }
                }
                else if (searchText) {
                    log.debug("Search text is: " + form.searchText);
                    jolokia.execute(mbean, "searchText", form.searchText, Core.onSuccess(render));
                }
                else if ($scope.hasAdvancedSearch(form)) {
                    log.debug("Searching for " + form.searchGroup + "/" + form.searchArtifact + "/" + form.searchVersion + "/" + form.searchPackaging + "/" + form.searchClassifier + "/" + form.searchClassName);
                    jolokia.execute(mbean, "search", form.searchGroup || "", form.searchArtifact || "", form.searchVersion || "", form.searchPackaging || "", form.searchClassifier || "", form.searchClassName || "", Core.onSuccess(render));
                }
            }
            else {
                Core.notification("error", "Cannot find the Maven Indexer MBean!");
            }
        };
        // cap ui table at one thousand
        var RESPONSE_LIMIT = 1000;
        var SERVER_RESPONSE_LIMIT = (10 * RESPONSE_LIMIT) + 1;
        function render(response) {
            log.debug("Search done, preparing result.");
            $scope.done = true;
            $scope.inProgress = false;
            // let's limit the reponse to avoid blowing up
            // the browser until we start using a widget
            // that supports pagination
            if (response.length > RESPONSE_LIMIT) {
                var serverLimit = response.length === SERVER_RESPONSE_LIMIT;
                if (serverLimit) {
                    $scope.tooManyResponses = "This search returned more than " + (SERVER_RESPONSE_LIMIT - 1) + " artifacts, showing the first " + RESPONSE_LIMIT + ", please refine your search";
                }
                else {
                    $scope.tooManyResponses = "This search returned " + response.length + " artifacts, showing the first " + RESPONSE_LIMIT + ", please refine your search";
                }
            }
            else {
                $scope.tooManyResponses = "";
            }
            $scope.artifacts = response.first(RESPONSE_LIMIT);
            Core.$apply($scope);
        }
    }]);
})(Maven || (Maven = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="mavenPlugin.ts"/>
/**
 * @module Maven
 */
var Maven;
(function (Maven) {
    Maven._module.controller("Maven.TestController", ["$scope", "workspace", "jolokia", "$q", "$templateCache", function ($scope, workspace, jolokia, $q, $templateCache) {
        $scope.html = "text/html";
        $scope.someUri = '';
        $scope.uriParts = [];
        $scope.mavenCompletion = $templateCache.get("mavenCompletionTemplate");
        $scope.$watch('someUri', function (newValue, oldValue) {
            if (newValue !== oldValue) {
                $scope.uriParts = newValue.split("/");
            }
        });
        $scope.$watch('uriParts', function (newValue, oldValue) {
            if (newValue !== oldValue) {
                if (newValue.length === 1 && newValue.length < oldValue.length) {
                    if (oldValue.last() !== '' && newValue.first().has(oldValue.last())) {
                        var merged = oldValue.first(oldValue.length - 1).include(newValue.first());
                        $scope.someUri = merged.join('/');
                    }
                }
            }
        }, true);
        $scope.doCompletionMaven = function (something) {
            return Maven.completeMavenUri($q, $scope, workspace, jolokia, something);
        };
    }]);
})(Maven || (Maven = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="mavenPlugin.ts"/>
/**
 * @module Maven
 */
var Maven;
(function (Maven) {
    Maven._module.controller("Maven.VersionsController", ["$scope", "$routeParams", "workspace", "jolokia", function ($scope, $routeParams, workspace, jolokia) {
        $scope.artifacts = [];
        $scope.group = $routeParams["group"] || "";
        $scope.artifact = $routeParams["artifact"] || "";
        $scope.version = "";
        $scope.classifier = $routeParams["classifier"] || "";
        $scope.packaging = $routeParams["packaging"] || "";
        var id = $scope.group + "/" + $scope.artifact;
        if ($scope.classifier) {
            id += "/" + $scope.classifier;
        }
        if ($scope.packaging) {
            id += "/" + $scope.packaging;
        }
        var columnTitle = id + " versions";
        var columnDefs = [
            {
                field: 'version',
                displayName: columnTitle,
                cellTemplate: '<div class="ngCellText"><a href="#/maven/artifact/{{row.entity.groupId}}/{{row.entity.artifactId}}/{{row.entity.version}}">{{row.entity.version}}</a></div>',
            }
        ];
        $scope.gridOptions = {
            data: 'artifacts',
            displayFooter: true,
            selectedItems: $scope.selected,
            selectWithCheckboxOnly: true,
            columnDefs: columnDefs,
            rowDetailTemplateId: "artifactDetailTemplate",
            sortInfo: { field: 'versionNumber', direction: 'DESC' },
            filterOptions: {
                filterText: 'search'
            }
        };
        Maven.addMavenFunctions($scope, workspace);
        $scope.$on("$routeChangeSuccess", function (event, current, previous) {
            // lets do this asynchronously to avoid Error: $digest already in progress
            setTimeout(updateTableContents, 50);
        });
        $scope.$watch('workspace.selection', function () {
            updateTableContents();
        });
        function updateTableContents() {
            var mbean = Maven.getMavenIndexerMBean(workspace);
            if (mbean) {
                jolokia.execute(mbean, "versionComplete", $scope.group, $scope.artifact, $scope.version, $scope.packaging, $scope.classifier, Core.onSuccess(render));
            }
            else {
                console.log("No MavenIndexerMBean!");
            }
        }
        function render(response) {
            $scope.artifacts = [];
            angular.forEach(response, function (version) {
                var versionNumberArray = Core.parseVersionNumbers(version);
                var versionNumber = 0;
                for (var i = 0; i <= 4; i++) {
                    var num = (i >= versionNumberArray.length) ? 0 : versionNumberArray[i];
                    versionNumber *= 1000;
                    versionNumber += num;
                }
                $scope.artifacts.push({
                    groupId: $scope.group,
                    artifactId: $scope.artifact,
                    packaging: $scope.packaging,
                    classifier: $scope.classifier,
                    version: version,
                    versionNumber: versionNumber
                });
            });
            Core.$apply($scope);
        }
    }]);
})(Maven || (Maven = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="mavenPlugin.ts"/>
/**
 * @module Maven
 */
var Maven;
(function (Maven) {
    Maven._module.controller("Maven.ViewController", ["$scope", "$location", "workspace", "jolokia", function ($scope, $location, workspace, jolokia) {
        $scope.$watch('workspace.tree', function () {
            // if the JMX tree is reloaded its probably because a new MBean has been added or removed
            // so lets reload, asynchronously just in case
            setTimeout(loadData, 50);
        });
        $scope.$on("$routeChangeSuccess", function (event, current, previous) {
            setTimeout(loadData, 50);
        });
        function loadData() {
        }
    }]);
})(Maven || (Maven = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="../../git/ts/gitHelpers.ts"/>
/**
 * @module Wiki
 */
var Wiki;
(function (Wiki) {
    Wiki.log = Logger.get("Wiki");
    Wiki.camelNamespaces = ["http://camel.apache.org/schema/spring", "http://camel.apache.org/schema/blueprint"];
    Wiki.springNamespaces = ["http://www.springframework.org/schema/beans"];
    Wiki.droolsNamespaces = ["http://drools.org/schema/drools-spring"];
    Wiki.dozerNamespaces = ["http://dozer.sourceforge.net"];
    Wiki.activemqNamespaces = ["http://activemq.apache.org/schema/core"];
    Wiki.excludeAdjustmentPrefixes = ["http://", "https://", "#"];
    (function (ViewMode) {
        ViewMode[ViewMode["List"] = 0] = "List";
        ViewMode[ViewMode["Icon"] = 1] = "Icon";
    })(Wiki.ViewMode || (Wiki.ViewMode = {}));
    var ViewMode = Wiki.ViewMode;
    ;
    /**
     * The custom views within the wiki namespace; either "/wiki/$foo" or "/wiki/branch/$branch/$foo"
     */
    Wiki.customWikiViewPages = ["/formTable", "/camel/diagram", "/camel/canvas", "/camel/properties", "/dozer/mappings"];
    /**
     * Which extensions do we wish to hide in the wiki file listing
     * @property hideExtensions
     * @for Wiki
     * @type Array
     */
    Wiki.hideExtensions = [".profile"];
    var defaultFileNamePattern = /^[a-zA-Z0-9._-]*$/;
    var defaultFileNamePatternInvalid = "Name must be: letters, numbers, and . _ or - characters";
    var defaultFileNameExtensionPattern = "";
    var defaultLowerCaseFileNamePattern = /^[a-z0-9._-]*$/;
    var defaultLowerCaseFileNamePatternInvalid = "Name must be: lower-case letters, numbers, and . _ or - characters";
    /**
     * The wizard tree for creating new content in the wiki
     * @property documentTemplates
     * @for Wiki
     * @type Array
     */
    Wiki.documentTemplates = [
        {
            label: "Folder",
            tooltip: "Create a new folder to contain documents",
            folder: true,
            icon: "/img/icons/wiki/folder.gif",
            exemplar: "myfolder",
            regex: defaultLowerCaseFileNamePattern,
            invalid: defaultLowerCaseFileNamePatternInvalid
        },
        {
            label: "App",
            tooltip: "Creates a new App folder used to configure and run containers",
            addClass: "fa fa-cog green",
            exemplar: 'myapp',
            regex: defaultFileNamePattern,
            invalid: defaultFileNamePatternInvalid,
            extension: '',
            generated: {
                mbean: ['io.fabric8', { type: 'KubernetesTemplateManager' }],
                init: function (workspace, $scope) {
                },
                generate: function (options) {
                    Wiki.log.debug("Got options: ", options);
                    options.form.name = options.name;
                    options.form.path = options.parentId;
                    options.form.branch = options.branch;
                    var json = angular.toJson(options.form);
                    var jolokia = HawtioCore.injector.get("jolokia");
                    jolokia.request({
                        type: 'exec',
                        mbean: 'io.fabric8:type=KubernetesTemplateManager',
                        operation: 'createAppByJson',
                        arguments: [json]
                    }, Core.onSuccess(function (response) {
                        Wiki.log.debug("Generated app, response: ", response);
                        options.success(undefined);
                    }, {
                        error: function (response) {
                            options.error(response.error);
                        }
                    }));
                },
                form: function (workspace, $scope) {
                    if (!$scope.doDockerRegistryCompletion) {
                        $scope.fetchDockerRepositories = function () {
                            return DockerRegistry.completeDockerRegistry();
                        };
                    }
                    return {
                        summaryMarkdown: 'Add app summary here',
                        replicaCount: 1
                    };
                },
                schema: {
                    description: 'App settings',
                    type: 'java.lang.String',
                    properties: {
                        'dockerImage': {
                            'description': 'Docker Image',
                            'type': 'java.lang.String',
                            'input-attributes': {
                                'required': '',
                                'class': 'input-xlarge',
                                'typeahead': 'repo for repo in fetchDockerRepositories() | filter:$viewValue',
                                'typeahead-wait-ms': '200'
                            }
                        },
                        'summaryMarkdown': {
                            'description': 'Short Description',
                            'type': 'java.lang.String',
                            'input-attributes': { 'class': 'input-xlarge' }
                        },
                        'replicaCount': {
                            'description': 'Replica Count',
                            'type': 'java.lang.Integer',
                            'input-attributes': {
                                min: '0'
                            }
                        },
                        'labels': {
                            'description': 'Labels',
                            'type': 'map',
                            'items': {
                                'type': 'string'
                            }
                        }
                    }
                }
            }
        },
        {
            label: "Fabric8 Profile",
            tooltip: "Create a new empty fabric profile. Using a hyphen ('-') will create a folder heirarchy, for example 'my-awesome-profile' will be available via the path 'my/awesome/profile'.",
            profile: true,
            addClass: "fa fa-book green",
            exemplar: "user-profile",
            regex: defaultLowerCaseFileNamePattern,
            invalid: defaultLowerCaseFileNamePatternInvalid,
            fabricOnly: true
        },
        {
            label: "Properties File",
            tooltip: "A properties file typically used to configure Java classes",
            exemplar: "properties-file.properties",
            regex: defaultFileNamePattern,
            invalid: defaultFileNamePatternInvalid,
            extension: ".properties"
        },
        {
            label: "JSON File",
            tooltip: "A file containing JSON data",
            exemplar: "document.json",
            regex: defaultFileNamePattern,
            invalid: defaultFileNamePatternInvalid,
            extension: ".json"
        },
        {
            label: "Key Store File",
            tooltip: "Creates a keystore (database) of cryptographic keys, X.509 certificate chains, and trusted certificates.",
            exemplar: 'keystore.jks',
            regex: defaultFileNamePattern,
            invalid: defaultFileNamePatternInvalid,
            extension: ".jks",
            generated: {
                mbean: ['hawtio', { type: 'KeystoreService' }],
                init: function (workspace, $scope) {
                    var mbean = 'hawtio:type=KeystoreService';
                    var response = workspace.jolokia.request({ type: "read", mbean: mbean, attribute: "SecurityProviderInfo" }, {
                        success: function (response) {
                            $scope.securityProviderInfo = response.value;
                            Core.$apply($scope);
                        },
                        error: function (response) {
                            console.log('Could not find the supported security algorithms: ', response.error);
                            Core.$apply($scope);
                        }
                    });
                },
                generate: function (options) {
                    var encodedForm = JSON.stringify(options.form);
                    var mbean = 'hawtio:type=KeystoreService';
                    var response = options.workspace.jolokia.request({
                        type: 'exec',
                        mbean: mbean,
                        operation: 'createKeyStoreViaJSON(java.lang.String)',
                        arguments: [encodedForm]
                    }, {
                        method: 'POST',
                        success: function (response) {
                            options.success(response.value);
                        },
                        error: function (response) {
                            options.error(response.error);
                        }
                    });
                },
                form: function (workspace, $scope) {
                    return {
                        storeType: $scope.securityProviderInfo.supportedKeyStoreTypes[0],
                        createPrivateKey: false,
                        keyLength: 4096,
                        keyAlgorithm: $scope.securityProviderInfo.supportedKeyAlgorithms[0],
                        keyValidity: 365
                    };
                },
                schema: {
                    "description": "Keystore Settings",
                    "type": "java.lang.String",
                    "properties": {
                        "storePassword": {
                            "description": "Keystore password.",
                            "type": "password",
                            'input-attributes': { "required": "", "ng-minlength": 6 }
                        },
                        "storeType": {
                            "description": "The type of store to create",
                            "type": "java.lang.String",
                            'input-element': "select",
                            'input-attributes': { "ng-options": "v for v in securityProviderInfo.supportedKeyStoreTypes" }
                        },
                        "createPrivateKey": {
                            "description": "Should we generate a self-signed private key?",
                            "type": "boolean"
                        },
                        "keyCommonName": {
                            "description": "The common name of the key, typically set to the hostname of the server",
                            "type": "java.lang.String",
                            'control-group-attributes': { 'ng-show': "formData.createPrivateKey" }
                        },
                        "keyLength": {
                            "description": "The length of the cryptographic key",
                            "type": "Long",
                            'control-group-attributes': { 'ng-show': "formData.createPrivateKey" }
                        },
                        "keyAlgorithm": {
                            "description": "The key algorithm",
                            "type": "java.lang.String",
                            'input-element': "select",
                            'input-attributes': { "ng-options": "v for v in securityProviderInfo.supportedKeyAlgorithms" },
                            'control-group-attributes': { 'ng-show': "formData.createPrivateKey" }
                        },
                        "keyValidity": {
                            "description": "The number of days the key will be valid for",
                            "type": "Long",
                            'control-group-attributes': { 'ng-show': "formData.createPrivateKey" }
                        },
                        "keyPassword": {
                            "description": "Password to the private key",
                            "type": "password",
                            'control-group-attributes': { 'ng-show': "formData.createPrivateKey" }
                        }
                    }
                }
            }
        },
        {
            label: "Markdown Document",
            tooltip: "A basic markup document using the Markdown wiki markup, particularly useful for ReadMe files in directories",
            exemplar: "ReadMe.md",
            regex: defaultFileNamePattern,
            invalid: defaultFileNamePatternInvalid,
            extension: ".md"
        },
        {
            label: "Text Document",
            tooltip: "A plain text file",
            exemplar: "document.text",
            regex: defaultFileNamePattern,
            invalid: defaultFileNamePatternInvalid,
            extension: ".txt"
        },
        {
            label: "HTML Document",
            tooltip: "A HTML document you can edit directly using the HTML markup",
            exemplar: "document.html",
            regex: defaultFileNamePattern,
            invalid: defaultFileNamePatternInvalid,
            extension: ".html"
        },
        {
            label: "XML Document",
            tooltip: "An empty XML document",
            exemplar: "document.xml",
            regex: defaultFileNamePattern,
            invalid: defaultFileNamePatternInvalid,
            extension: ".xml"
        },
        {
            label: "Integration Flows",
            tooltip: "Camel routes for defining your integration flows",
            children: [
                {
                    label: "Camel XML document",
                    tooltip: "A vanilla Camel XML document for integration flows",
                    icon: "/img/icons/camel.svg",
                    exemplar: "camel.xml",
                    regex: defaultFileNamePattern,
                    invalid: defaultFileNamePatternInvalid,
                    extension: ".xml"
                },
                {
                    label: "Camel OSGi Blueprint XML document",
                    tooltip: "A vanilla Camel XML document for integration flows when using OSGi Blueprint",
                    icon: "/img/icons/camel.svg",
                    exemplar: "camel-blueprint.xml",
                    regex: defaultFileNamePattern,
                    invalid: defaultFileNamePatternInvalid,
                    extension: ".xml"
                },
                {
                    label: "Camel Spring XML document",
                    tooltip: "A vanilla Camel XML document for integration flows when using the Spring framework",
                    icon: "/img/icons/camel.svg",
                    exemplar: "camel-spring.xml",
                    regex: defaultFileNamePattern,
                    invalid: defaultFileNamePatternInvalid,
                    extension: ".xml"
                }
            ]
        },
        {
            label: "Data Mapping Document",
            tooltip: "Dozer based configuration of mapping documents",
            icon: "/img/icons/dozer/dozer.gif",
            exemplar: "dozer-mapping.xml",
            regex: defaultFileNamePattern,
            invalid: defaultFileNamePatternInvalid,
            extension: ".xml"
        }
    ];
    function isFMCContainer(workspace) {
        return false;
    }
    Wiki.isFMCContainer = isFMCContainer;
    function isWikiEnabled(workspace, jolokia, localStorage) {
        return Git.createGitRepository(workspace, jolokia, localStorage) !== null;
    }
    Wiki.isWikiEnabled = isWikiEnabled;
    function goToLink(link, $timeout, $location) {
        var href = Core.trimLeading(link, "#");
        $timeout(function () {
            Wiki.log.debug("About to navigate to: " + href);
            $location.url(href);
        }, 100);
    }
    Wiki.goToLink = goToLink;
    /**
     * Returns all the links for the given branch for the custom views, starting with "/"
     * @param $scope
     * @returns {string[]}
     */
    function customViewLinks($scope) {
        var branch = $scope.branch;
        var prefix = Core.trimLeading(Wiki.startLink(branch), "#");
        return Wiki.customWikiViewPages.map(function (path) { return prefix + path; });
    }
    Wiki.customViewLinks = customViewLinks;
    /**
     * Returns a new create document wizard tree
     * @method createWizardTree
     * @for Wiki
     * @static
     */
    function createWizardTree(workspace, $scope) {
        var root = new Folder("New Documents");
        addCreateWizardFolders(workspace, $scope, root, Wiki.documentTemplates);
        return root;
    }
    Wiki.createWizardTree = createWizardTree;
    function addCreateWizardFolders(workspace, $scope, parent, templates) {
        angular.forEach(templates, function (template) {
            if (template.generated) {
                if (template.generated.mbean) {
                    var exists = workspace.treeContainsDomainAndProperties.apply(workspace, template.generated.mbean);
                    if (!exists) {
                        return;
                    }
                }
                if (template.generated.init) {
                    template.generated.init(workspace, $scope);
                }
            }
            var title = template.label || key;
            var node = new Folder(title);
            node.parent = parent;
            node.entity = template;
            var addClass = template.addClass;
            if (addClass) {
                node.addClass = addClass;
            }
            var key = template.exemplar;
            var parentKey = parent.key || "";
            node.key = parentKey ? parentKey + "_" + key : key;
            var icon = template.icon;
            if (icon) {
                node.icon = Core.url(icon);
            }
            // compiler was complaining about 'label' had no idea where it's coming from
            // var tooltip = value["tooltip"] || value["description"] || label;
            var tooltip = template["tooltip"] || template["description"] || '';
            node.tooltip = tooltip;
            if (template["folder"]) {
                node.isFolder = function () {
                    return true;
                };
            }
            parent.children.push(node);
            var children = template.children;
            if (children) {
                addCreateWizardFolders(workspace, $scope, node, children);
            }
        });
    }
    Wiki.addCreateWizardFolders = addCreateWizardFolders;
    function startLink(branch) {
        var start = "/wiki";
        if (branch) {
            start = UrlHelpers.join(start, 'branch', branch);
        }
        return start;
    }
    Wiki.startLink = startLink;
    /**
     * Returns true if the given filename/path is an index page (named index.* and is a markdown/html page).
     *
     * @param path
     * @returns {boolean}
     */
    function isIndexPage(path) {
        return path && (path.endsWith("index.md") || path.endsWith("index.html") || path.endsWith("index")) ? true : false;
    }
    Wiki.isIndexPage = isIndexPage;
    function viewLink(branch, pageId, $location, fileName) {
        if (fileName === void 0) { fileName = null; }
        var link = null;
        var start = startLink(branch);
        if (pageId) {
            // figure out which view to use for this page
            var view = isIndexPage(pageId) ? "/book/" : "/view/";
            link = start + view + encodePath(Core.trimLeading(pageId, "/"));
        }
        else {
            // lets use the current path
            var path = $location.path();
            link = "#" + path.replace(/(edit|create)/, "view");
        }
        if (fileName && pageId && pageId.endsWith(fileName)) {
            return link;
        }
        if (fileName) {
            if (!link.endsWith("/")) {
                link += "/";
            }
            link += fileName;
        }
        return link;
    }
    Wiki.viewLink = viewLink;
    function branchLink(branch, pageId, $location, fileName) {
        if (fileName === void 0) { fileName = null; }
        return viewLink(branch, pageId, $location, fileName);
    }
    Wiki.branchLink = branchLink;
    function editLink(branch, pageId, $location) {
        var link = null;
        var format = Wiki.fileFormat(pageId);
        switch (format) {
            case "image":
                break;
            default:
                var start = startLink(branch);
                if (pageId) {
                    link = start + "/edit/" + encodePath(pageId);
                }
                else {
                    // lets use the current path
                    var path = $location.path();
                    link = "#" + path.replace(/(view|create)/, "edit");
                }
        }
        return link;
    }
    Wiki.editLink = editLink;
    function createLink(branch, pageId, $location, $scope) {
        var path = $location.path();
        var start = startLink(branch);
        var link = '';
        if (pageId) {
            link = start + "/create/" + encodePath(pageId);
        }
        else {
            // lets use the current path
            link = "#" + path.replace(/(view|edit|formTable)/, "create");
        }
        // we have the link so lets now remove the last path
        // or if there is no / in the path then remove the last section
        var idx = link.lastIndexOf("/");
        if (idx > 0 && !$scope.children && !path.startsWith("/wiki/formTable")) {
            link = link.substring(0, idx + 1);
        }
        return link;
    }
    Wiki.createLink = createLink;
    function encodePath(pageId) {
        return pageId.split("/").map(encodeURIComponent).join("/");
    }
    Wiki.encodePath = encodePath;
    function decodePath(pageId) {
        return pageId.split("/").map(decodeURIComponent).join("/");
    }
    Wiki.decodePath = decodePath;
    function fileFormat(name, fileExtensionTypeRegistry) {
        var extension = fileExtension(name);
        var answer = null;
        if (!fileExtensionTypeRegistry) {
            fileExtensionTypeRegistry = HawtioCore.injector.get("fileExtensionTypeRegistry");
        }
        angular.forEach(fileExtensionTypeRegistry, function (array, key) {
            if (array.indexOf(extension) >= 0) {
                answer = key;
            }
        });
        return answer;
    }
    Wiki.fileFormat = fileFormat;
    /**
     * Returns the file name of the given path; stripping off any directories
     * @method fileName
     * @for Wiki
     * @static
     * @param {String} path
     * @return {String}
     */
    function fileName(path) {
        if (path) {
            var idx = path.lastIndexOf("/");
            if (idx > 0) {
                return path.substring(idx + 1);
            }
        }
        return path;
    }
    Wiki.fileName = fileName;
    /**
     * Returns the folder of the given path (everything but the last path name)
     * @method fileParent
     * @for Wiki
     * @static
     * @param {String} path
     * @return {String}
     */
    function fileParent(path) {
        if (path) {
            var idx = path.lastIndexOf("/");
            if (idx > 0) {
                return path.substring(0, idx);
            }
        }
        // lets return the root directory
        return "";
    }
    Wiki.fileParent = fileParent;
    /**
     * Returns the file name for the given name; we hide some extensions
     * @method hideFineNameExtensions
     * @for Wiki
     * @static
     * @param {String} name
     * @return {String}
     */
    function hideFileNameExtensions(name) {
        if (name) {
            angular.forEach(Wiki.hideExtensions, function (extension) {
                if (name.endsWith(extension)) {
                    name = name.substring(0, name.length - extension.length);
                }
            });
        }
        return name;
    }
    Wiki.hideFileNameExtensions = hideFileNameExtensions;
    /**
     * Returns the URL to perform a GET or POST for the given branch name and path
     */
    function gitRestURL(branch, path) {
        var url = gitRelativeURL(branch, path);
        url = Core.url('/' + url);
        var connectionName = Core.getConnectionNameParameter();
        if (connectionName) {
            var connectionOptions = Core.getConnectOptions(connectionName);
            if (connectionOptions) {
                connectionOptions.path = url;
                url = Core.createServerConnectionUrl(connectionOptions);
            }
        }
        return url;
    }
    Wiki.gitRestURL = gitRestURL;
    function gitUrlPrefix() {
        var prefix = "";
        var injector = HawtioCore.injector;
        if (injector) {
            prefix = injector.get("WikiGitUrlPrefix") || "";
        }
        return prefix;
    }
    /**
   * Returns a relative URL to perform a GET or POST for the given branch/path
   */
    function gitRelativeURL(branch, path) {
        var prefix = gitUrlPrefix();
        branch = branch || "master";
        path = path || "/";
        return UrlHelpers.join(prefix, "git/" + branch, path);
    }
    Wiki.gitRelativeURL = gitRelativeURL;
    /**
     * Takes a row containing the entity object; or can take the entity directly.
     *
     * It then uses the name, directory and xmlNamespaces properties
     *
     * @method fileIconHtml
     * @for Wiki
     * @static
     * @param {any} row
     * @return {String}
     *
     */
    function fileIconHtml(row) {
        var name = row.name;
        var path = row.path;
        var branch = row.branch;
        var directory = row.directory;
        var xmlNamespaces = row.xmlNamespaces;
        var iconUrl = row.iconUrl;
        var entity = row.entity;
        if (entity) {
            name = name || entity.name;
            path = path || entity.path;
            branch = branch || entity.branch;
            directory = directory || entity.directory;
            xmlNamespaces = xmlNamespaces || entity.xmlNamespaces;
            iconUrl = iconUrl || entity.iconUrl;
        }
        branch = branch || "master";
        var css = null;
        var icon = null;
        var extension = fileExtension(name);
        // TODO could we use different icons for markdown v xml v html
        if (xmlNamespaces && xmlNamespaces.length) {
            if (xmlNamespaces.any(function (ns) { return Wiki.camelNamespaces.any(ns); })) {
                icon = "img/icons/camel.svg";
            }
            else if (xmlNamespaces.any(function (ns) { return Wiki.dozerNamespaces.any(ns); })) {
                icon = "img/icons/dozer/dozer.gif";
            }
            else if (xmlNamespaces.any(function (ns) { return Wiki.activemqNamespaces.any(ns); })) {
                icon = "img/icons/messagebroker.svg";
            }
            else {
                Wiki.log.debug("file " + name + " has namespaces " + xmlNamespaces);
            }
        }
        if (iconUrl) {
            css = null;
            var prefix = gitUrlPrefix();
            icon = UrlHelpers.join(prefix, "git", iconUrl);
            var connectionName = Core.getConnectionNameParameter();
            if (connectionName) {
                var connectionOptions = Core.getConnectOptions(connectionName);
                if (connectionOptions) {
                    connectionOptions.path = Core.url('/' + icon);
                    icon = Core.createServerConnectionUrl(connectionOptions);
                }
            }
        }
        if (!icon) {
            if (directory) {
                switch (extension) {
                    case 'profile':
                        css = "fa fa-book";
                        break;
                    default:
                        // log.debug("No match for extension: ", extension, " using a generic folder icon");
                        css = "fa fa-folder";
                }
            }
            else {
                switch (extension) {
                    case 'png':
                    case 'svg':
                    case 'jpg':
                    case 'gif':
                        css = null;
                        icon = Wiki.gitRelativeURL(branch, path);
                        var connectionName = Core.getConnectionNameParameter();
                        if (connectionName) {
                            var connectionOptions = Core.getConnectOptions(connectionName);
                            if (connectionOptions) {
                                connectionOptions.path = Core.url('/' + icon);
                                icon = Core.createServerConnectionUrl(connectionOptions);
                            }
                        }
                        break;
                    case 'json':
                    case 'xml':
                        css = "fa fa-file-text";
                        break;
                    case 'md':
                        css = "fa fa-file-text-o";
                        break;
                    default:
                        // log.debug("No match for extension: ", extension, " using a generic file icon");
                        css = "fa fa-file-alt";
                }
            }
        }
        if (icon) {
            return "<img src='" + Core.url(icon) + "'>";
        }
        else {
            return "<i class='" + css + "'></i>";
        }
    }
    Wiki.fileIconHtml = fileIconHtml;
    function iconClass(row) {
        var name = row.getProperty("name");
        var extension = fileExtension(name);
        var directory = row.getProperty("directory");
        if (directory) {
            return "fa fa-folder";
        }
        if ("xml" === extension) {
            return "fa fa-cog";
        }
        else if ("md" === extension) {
            return "fa fa-file-text-o";
        }
        // TODO could we use different icons for markdown v xml v html
        return "fa fa-file-alt";
    }
    Wiki.iconClass = iconClass;
    /**
     * Extracts the pageId, branch, objectId from the route parameters
     * @method initScope
     * @for Wiki
     * @static
     * @param {*} $scope
     * @param {any} $routeParams
     * @param {ng.ILocationService} $location
     */
    function initScope($scope, $routeParams, $location) {
        $scope.pageId = Wiki.pageId($routeParams, $location);
        $scope.branch = $routeParams["branch"] || $location.search()["branch"];
        $scope.objectId = $routeParams["objectId"];
        $scope.startLink = Wiki.startLink($scope.branch);
        $scope.historyLink = startLink($scope.branch) + "/history/" + ($scope.pageId || "");
    }
    Wiki.initScope = initScope;
    /**
     * Loads the branches for this wiki repository and stores them in the branches property in
     * the $scope and ensures $scope.branch is set to a valid value
     *
     * @param wikiRepository
     * @param $scope
     * @param isFmc whether we run as fabric8 or as hawtio
     */
    function loadBranches(jolokia, wikiRepository, $scope, isFmc) {
        if (isFmc === void 0) { isFmc = false; }
        wikiRepository.branches(function (response) {
            // lets sort by version number
            $scope.branches = response.sortBy(function (v) { return Core.versionToSortableString(v); }, true);
            // default the branch name if we have 'master'
            if (!$scope.branch && $scope.branches.find(function (branch) {
                return branch === "master";
            })) {
                $scope.branch = "master";
            }
            Core.$apply($scope);
        });
    }
    Wiki.loadBranches = loadBranches;
    /**
     * Extracts the pageId from the route parameters
     * @method pageId
     * @for Wiki
     * @static
     * @param {any} $routeParams
     * @param @ng.ILocationService @location
     * @return {String}
     */
    function pageId($routeParams, $location) {
        var pageId = $routeParams['page'];
        if (!pageId) {
            for (var i = 0; i < 100; i++) {
                var value = $routeParams['path' + i];
                if (angular.isDefined(value)) {
                    if (!pageId) {
                        pageId = value;
                    }
                    else {
                        pageId += "/" + value;
                    }
                }
                else
                    break;
            }
            return pageId || "/";
        }
        // if no $routeParams variables lets figure it out from the $location
        if (!pageId) {
            pageId = pageIdFromURI($location.path());
        }
        return pageId;
    }
    Wiki.pageId = pageId;
    function pageIdFromURI(url) {
        var wikiPrefix = "/wiki/";
        if (url && url.startsWith(wikiPrefix)) {
            var idx = url.indexOf("/", wikiPrefix.length + 1);
            if (idx > 0) {
                return url.substring(idx + 1, url.length);
            }
        }
        return null;
    }
    Wiki.pageIdFromURI = pageIdFromURI;
    function fileExtension(name) {
        if (name.indexOf('#') > 0)
            name = name.substring(0, name.indexOf('#'));
        return Core.fileExtension(name, "markdown");
    }
    Wiki.fileExtension = fileExtension;
    function onComplete(status) {
        console.log("Completed operation with status: " + JSON.stringify(status));
    }
    Wiki.onComplete = onComplete;
    /**
     * Parses the given JSON text reporting to the user if there is a parse error
     * @method parseJson
     * @for Wiki
     * @static
     * @param {String} text
     * @return {any}
     */
    function parseJson(text) {
        if (text) {
            try {
                return JSON.parse(text);
            }
            catch (e) {
                Core.notification("error", "Failed to parse JSON: " + e);
            }
        }
        return null;
    }
    Wiki.parseJson = parseJson;
    /**
     * Adjusts a relative or absolute link from a wiki or file system to one using the hash bang syntax
     * @method adjustHref
     * @for Wiki
     * @static
     * @param {*} $scope
     * @param {ng.ILocationService} $location
     * @param {String} href
     * @param {String} fileExtension
     * @return {string}
     */
    function adjustHref($scope, $location, href, fileExtension) {
        var extension = fileExtension ? "." + fileExtension : "";
        // if the last part of the path has a dot in it lets
        // exclude it as we are relative to a markdown or html file in a folder
        // such as when viewing readme.md or index.md
        var path = $location.path();
        var folderPath = path;
        var idx = path.lastIndexOf("/");
        if (idx > 0) {
            var lastName = path.substring(idx + 1);
            if (lastName.indexOf(".") >= 0) {
                folderPath = path.substring(0, idx);
            }
        }
        // Deal with relative URLs first...
        if (href.startsWith('../')) {
            var parts = href.split('/');
            var pathParts = folderPath.split('/');
            var parents = parts.filter(function (part) {
                return part === "..";
            });
            parts = parts.last(parts.length - parents.length);
            pathParts = pathParts.first(pathParts.length - parents.length);
            return '#' + pathParts.join('/') + '/' + parts.join('/') + extension + $location.hash();
        }
        // Turn an absolute link into a wiki link...
        if (href.startsWith('/')) {
            return Wiki.branchLink($scope.branch, href + extension, $location) + extension;
        }
        if (!Wiki.excludeAdjustmentPrefixes.any(function (exclude) {
            return href.startsWith(exclude);
        })) {
            return '#' + folderPath + "/" + href + extension + $location.hash();
        }
        else {
            return null;
        }
    }
    Wiki.adjustHref = adjustHref;
})(Wiki || (Wiki = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="../../git/ts/gitHelpers.ts"/>
/// <reference path="wikiHelpers.ts"/>
/**
 * @module Wiki
 * @main Wiki
 */
var Wiki;
(function (Wiki) {
    Wiki.pluginName = 'wiki';
    Wiki.templatePath = 'plugins/wiki/html/';
    Wiki.tab = null;
    Wiki._module = angular.module(Wiki.pluginName, ['ngResource', 'hawtio-core', 'hawtio-ui',]);
    Wiki.controller = PluginHelpers.createControllerFunction(Wiki._module, 'Wiki');
    Wiki.route = PluginHelpers.createRoutingFunction(Wiki.templatePath);
    Wiki._module.config(["$routeProvider", function ($routeProvider) {
        // allow optional branch paths...
        angular.forEach(["", "/branch/:branch"], function (path) {
            $routeProvider.when(UrlHelpers.join('/wiki', path, 'view'), Wiki.route('viewPage.html', false)).when(UrlHelpers.join('/wiki', path, 'create/:page*'), Wiki.route('create.html', false)).when('/wiki' + path + '/view/:page*', { templateUrl: 'plugins/wiki/html/viewPage.html', reloadOnSearch: false }).when('/wiki' + path + '/book/:page*', { templateUrl: 'plugins/wiki/html/viewBook.html', reloadOnSearch: false }).when('/wiki' + path + '/edit/:page*', { templateUrl: 'plugins/wiki/html/editPage.html' }).when('/wiki' + path + '/version/:page*\/:objectId', { templateUrl: 'plugins/wiki/html/viewPage.html' }).when('/wiki' + path + '/history/:page*', { templateUrl: 'plugins/wiki/html/history.html' }).when('/wiki' + path + '/commit/:page*\/:objectId', { templateUrl: 'plugins/wiki/html/commit.html' }).when('/wiki' + path + '/diff/:page*\/:objectId/:baseObjectId', { templateUrl: 'plugins/wiki/html/viewPage.html', reloadOnSearch: false }).when('/wiki' + path + '/formTable/:page*', { templateUrl: 'plugins/wiki/html/formTable.html' }).when('/wiki' + path + '/dozer/mappings/:page*', { templateUrl: 'plugins/wiki/html/dozerMappings.html' }).when('/wiki' + path + '/configurations/:page*', { templateUrl: 'plugins/wiki/html/configurations.html' }).when('/wiki' + path + '/configuration/:pid/:page*', { templateUrl: 'plugins/wiki/html/configuration.html' }).when('/wiki' + path + '/newConfiguration/:factoryPid/:page*', { templateUrl: 'plugins/wiki/html/configuration.html' });
        });
    }]);
    Wiki._module.factory('wikiRepository', ["workspace", "jolokia", "localStorage", function (workspace, jolokia, localStorage) {
        return new Wiki.GitWikiRepository(function () { return Git.createGitRepository(workspace, jolokia, localStorage); });
    }]);
    Wiki._module.factory('wikiBranchMenu', function () {
        var self = {
            items: [],
            addExtension: function (item) {
                self.items.push(item);
            },
            applyMenuExtensions: function (menu) {
                if (self.items.length === 0) {
                    return;
                }
                var extendedMenu = [{
                    heading: "Actions"
                }];
                self.items.forEach(function (item) {
                    if (item.valid()) {
                        extendedMenu.push(item);
                    }
                });
                if (extendedMenu.length > 1) {
                    menu.add(extendedMenu);
                }
            }
        };
        return self;
    });
    Wiki._module.factory('WikiGitUrlPrefix', function () {
        return "";
    });
    Wiki._module.factory('fileExtensionTypeRegistry', function () {
        return {
            "image": ["svg", "png", "ico", "bmp", "jpg", "gif"],
            "markdown": ["md", "markdown", "mdown", "mkdn", "mkd"],
            "htmlmixed": ["html", "xhtml", "htm"],
            "text/x-java": ["java"],
            "text/x-scala": ["scala"],
            "javascript": ["js", "json", "javascript", "jscript", "ecmascript", "form"],
            "xml": ["xml", "xsd", "wsdl", "atom"],
            "properties": ["properties"]
        };
    });
    Wiki._module.filter('fileIconClass', function () { return Wiki.iconClass; });
    Wiki._module.run(["$location", "workspace", "viewRegistry", "jolokia", "localStorage", "layoutFull", "helpRegistry", "preferencesRegistry", "wikiRepository", "$rootScope", function ($location, workspace, viewRegistry, jolokia, localStorage, layoutFull, helpRegistry, preferencesRegistry, wikiRepository, 
        /*
        TODO
                postLoginTasks,
        */
        $rootScope) {
        viewRegistry['wiki'] = Wiki.templatePath + 'layoutWiki.html';
        helpRegistry.addUserDoc('wiki', 'plugins/wiki/doc/help.md', function () {
            return Wiki.isWikiEnabled(workspace, jolokia, localStorage);
        });
        preferencesRegistry.addTab("Git", 'plugins/wiki/html/gitPreferences.html');
        Wiki.tab = {
            id: "wiki",
            content: "Wiki",
            title: "View and edit wiki pages",
            isValid: function (workspace) { return Wiki.isWikiEnabled(workspace, jolokia, localStorage); },
            href: function () { return "#/wiki/view"; },
            isActive: function (workspace) { return workspace.isLinkActive("/wiki") && !workspace.linkContains("fabric", "profiles") && !workspace.linkContains("editFeatures"); }
        };
        workspace.topLevelTabs.push(Wiki.tab);
        /*
        TODO
            postLoginTasks.addTask('wikiGetRepositoryLabel', () => {
              wikiRepository.getRepositoryLabel((label) => {
                tab.content = label;
                Core.$apply($rootScope)
              }, (response) => {
                // silently ignore
              });
            });
        */
        // add empty regexs to templates that don't define
        // them so ng-pattern doesn't barf
        Wiki.documentTemplates.forEach(function (template) {
            if (!template['regex']) {
                template.regex = /(?:)/;
            }
        });
    }]);
    hawtioPluginLoader.addModule(Wiki.pluginName);
})(Wiki || (Wiki = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="../../git/ts/gitHelpers.ts"/>
/// <reference path="wikiHelpers.ts"/>
/// <reference path="wikiPlugin.ts"/>
/**
 * @module Wiki
 */
var Wiki;
(function (Wiki) {
    Wiki._module.controller("Wiki.CommitController", ["$scope", "$location", "$routeParams", "$templateCache", "workspace", "marked", "fileExtensionTypeRegistry", "wikiRepository", "jolokia", function ($scope, $location, $routeParams, $templateCache, workspace, marked, fileExtensionTypeRegistry, wikiRepository, jolokia) {
        var isFmc = Wiki.isFMCContainer(workspace);
        Wiki.initScope($scope, $routeParams, $location);
        $scope.commitId = $scope.objectId;
        $scope.selectedItems = [];
        // TODO we could configure this?
        $scope.dateFormat = 'EEE, MMM d, y : hh:mm:ss a';
        $scope.gridOptions = {
            data: 'commits',
            showFilter: false,
            multiSelect: false,
            selectWithCheckboxOnly: true,
            showSelectionCheckbox: true,
            displaySelectionCheckbox: true,
            selectedItems: $scope.selectedItems,
            filterOptions: {
                filterText: ''
            },
            columnDefs: [
                {
                    field: 'path',
                    displayName: 'File Name',
                    cellTemplate: $templateCache.get('fileCellTemplate.html'),
                    width: "***",
                    cellFilter: ""
                },
            ]
        };
        $scope.$on("$routeChangeSuccess", function (event, current, previous) {
            // lets do this asynchronously to avoid Error: $digest already in progress
            setTimeout(updateView, 50);
        });
        $scope.$watch('workspace.tree', function () {
            if (!$scope.git && Git.getGitMBean(workspace)) {
                // lets do this asynchronously to avoid Error: $digest already in progress
                //console.log("Reloading the view as we now seem to have a git mbean!");
                setTimeout(updateView, 50);
            }
        });
        $scope.canRevert = function () {
            return $scope.selectedItems.length === 1;
        };
        $scope.revert = function () {
            if ($scope.selectedItems.length > 0) {
                var path = commitPath($scope.selectedItems[0]);
                var objectId = $scope.commitId;
                if (path && objectId) {
                    var commitMessage = "Reverting file " + $scope.pageId + " to previous version " + objectId;
                    wikiRepository.revertTo($scope.branch, objectId, $scope.pageId, commitMessage, function (result) {
                        Wiki.onComplete(result);
                        // now lets update the view
                        updateView();
                    });
                }
            }
        };
        function commitPath(commit) {
            return commit.path || commit.name;
        }
        $scope.diff = function () {
            if ($scope.selectedItems.length > 0) {
                var commit = $scope.selectedItems[0];
                /*
                 var commit = row;
                 var entity = row.entity;
                 if (entity) {
                 commit = entity;
                 }
                 */
                var link = Wiki.startLink($scope.branch) + "/diff/" + commitPath(commit) + "/" + $scope.commitId + "/";
                var path = Core.trimLeading(link, "#");
                $location.path(path);
            }
        };
        updateView();
        function updateView() {
            var commitId = $scope.commitId;
            Wiki.loadBranches(jolokia, wikiRepository, $scope, isFmc);
            wikiRepository.commitInfo(commitId, function (commitInfo) {
                $scope.commitInfo = commitInfo;
                Core.$apply($scope);
            });
            wikiRepository.commitTree(commitId, function (commits) {
                $scope.commits = commits;
                angular.forEach(commits, function (commit) {
                    commit.fileIconHtml = Wiki.fileIconHtml(commit);
                    commit.fileClass = commit.name.endsWith(".profile") ? "green" : "";
                    var changeType = commit.changeType;
                    var path = commitPath(commit);
                    if (path) {
                        commit.fileLink = Wiki.startLink($scope.branch) + '/version/' + path + '/' + commitId;
                    }
                    if (changeType) {
                        changeType = changeType.toLowerCase();
                        if (changeType.startsWith("a")) {
                            commit.changeClass = "change-add";
                            commit.change = "add";
                            commit.title = "added";
                        }
                        else if (changeType.startsWith("d")) {
                            commit.changeClass = "change-delete";
                            commit.change = "delete";
                            commit.title = "deleted";
                            commit.fileLink = null;
                        }
                        else {
                            commit.changeClass = "change-modify";
                            commit.change = "modify";
                            commit.title = "modified";
                        }
                        commit.changeTypeHtml = '<span class="' + commit.changeClass + '">' + commit.title + '</span>';
                    }
                });
                Core.$apply($scope);
            });
        }
    }]);
})(Wiki || (Wiki = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="../../git/ts/gitHelpers.ts"/>
/// <reference path="wikiHelpers.ts"/>
/// <reference path="wikiPlugin.ts"/>
var Wiki;
(function (Wiki) {
    var CreateController = Wiki.controller("CreateController", ["$scope", "$location", "$routeParams", "$route", "$http", "$timeout", "workspace", "jolokia", "wikiRepository", function ($scope, $location, $routeParams, $route, $http, $timeout, workspace, jolokia, wikiRepository) {
        var isFmc = Wiki.isFMCContainer(workspace);
        Wiki.initScope($scope, $routeParams, $location);
        $scope.createDocumentTree = Wiki.createWizardTree(workspace, $scope);
        $scope.createDocumentTreeActivations = ["camel-spring.xml", "ReadMe.md"];
        $scope.fileExists = {
            exists: false,
            name: ""
        };
        $scope.newDocumentName = "";
        $scope.selectedCreateDocumentExtension = null;
        $scope.fileExists.exists = false;
        $scope.fileExists.name = "";
        $scope.newDocumentName = "";
        function returnToDirectory() {
            var link = Wiki.viewLink($scope.branch, $scope.pageId, $location);
            Wiki.log.debug("Cancelling, going to link: ", link);
            Wiki.goToLink(link, $timeout, $location);
        }
        $scope.cancel = function () {
            returnToDirectory();
        };
        $scope.onCreateDocumentSelect = function (node) {
            // reset as we switch between document types
            $scope.fileExists.exists = false;
            $scope.fileExists.name = "";
            var entity = node ? node.entity : null;
            $scope.selectedCreateDocumentTemplate = entity;
            $scope.selectedCreateDocumentTemplateRegex = $scope.selectedCreateDocumentTemplate.regex || /.*/;
            $scope.selectedCreateDocumentTemplateInvalid = $scope.selectedCreateDocumentTemplate.invalid || "invalid name";
            $scope.selectedCreateDocumentTemplateExtension = $scope.selectedCreateDocumentTemplate.extension || null;
            Wiki.log.debug("Entity: ", entity);
            if (entity) {
                if (entity.generated) {
                    $scope.formSchema = entity.generated.schema;
                    $scope.formData = entity.generated.form(workspace, $scope);
                }
                else {
                    $scope.formSchema = {};
                    $scope.formData = {};
                }
                Core.$apply($scope);
            }
        };
        $scope.addAndCloseDialog = function (fileName) {
            $scope.newDocumentName = fileName;
            var template = $scope.selectedCreateDocumentTemplate;
            var path = getNewDocumentPath();
            // clear $scope.newDocumentName so we dont remember it when we open it next time
            $scope.newDocumentName = null;
            // reset before we check just in a bit
            $scope.fileExists.exists = false;
            $scope.fileExists.name = "";
            $scope.fileExtensionInvalid = null;
            if (!template || !path) {
                return;
            }
            // validate if the name match the extension
            if ($scope.selectedCreateDocumentTemplateExtension) {
                var idx = path.lastIndexOf('.');
                if (idx > 0) {
                    var ext = path.substring(idx);
                    if ($scope.selectedCreateDocumentTemplateExtension !== ext) {
                        $scope.fileExtensionInvalid = "File extension must be: " + $scope.selectedCreateDocumentTemplateExtension;
                        Core.$apply($scope);
                        return;
                    }
                }
            }
            // validate if the file exists, and use the synchronous call
            var exists = wikiRepository.exists($scope.branch, path, null);
            if (exists) {
                $scope.fileExists.exists = true;
                $scope.fileExists.name = path;
                Core.$apply($scope);
                return;
            }
            var name = Wiki.fileName(path);
            var folder = Wiki.fileParent(path);
            var exemplar = template.exemplar;
            var commitMessage = "Created " + template.label;
            var exemplarUri = Core.url("/plugins/wiki/exemplar/" + exemplar);
            if (template.folder) {
                Core.notification("success", "Creating new folder " + name);
                wikiRepository.createDirectory($scope.branch, path, commitMessage, function (status) {
                    var link = Wiki.viewLink($scope.branch, path, $location);
                    Wiki.goToLink(link, $timeout, $location);
                });
            }
            else if (template.profile) {
                function toPath(profileName) {
                    var answer = "fabric/profiles/" + profileName;
                    answer = answer.replace(/-/g, "/");
                    answer = answer + ".profile";
                    return answer;
                }
                function toProfileName(path) {
                    var answer = path.replace(/^fabric\/profiles\//, "");
                    answer = answer.replace(/\//g, "-");
                    answer = answer.replace(/\.profile$/, "");
                    return answer;
                }
                // strip off any profile name in case the user creates a profile while looking at
                // another profile
                folder = folder.replace(/\/=?(\w*)\.profile$/, "");
                var concatenated = folder + "/" + name;
                var profileName = toProfileName(concatenated);
                var targetPath = toPath(profileName);
            }
            else if (template.generated) {
                var options = {
                    workspace: workspace,
                    form: $scope.formData,
                    name: fileName,
                    parentId: folder,
                    branch: $scope.branch,
                    success: function (contents) {
                        if (contents) {
                            wikiRepository.putPageBase64($scope.branch, path, contents, commitMessage, function (status) {
                                Wiki.log.debug("Created file " + name);
                                Wiki.onComplete(status);
                                returnToDirectory();
                            });
                        }
                        else {
                            returnToDirectory();
                        }
                    },
                    error: function (error) {
                        Core.notification('error', error);
                        Core.$apply($scope);
                    }
                };
                template.generated.generate(options);
            }
            else {
                // load the example data (if any) and then add the document to git and change the link to the new document
                $http.get(exemplarUri).success(function (data, status, headers, config) {
                    putPage(path, name, folder, data, commitMessage);
                }).error(function (data, status, headers, config) {
                    // create an empty file
                    putPage(path, name, folder, "", commitMessage);
                });
            }
        };
        function putPage(path, name, folder, contents, commitMessage) {
            // TODO lets check this page does not exist - if it does lets keep adding a new post fix...
            wikiRepository.putPage($scope.branch, path, contents, commitMessage, function (status) {
                Wiki.log.debug("Created file " + name);
                Wiki.onComplete(status);
                // lets navigate to the edit link
                // load the directory and find the child item
                $scope.git = wikiRepository.getPage($scope.branch, folder, $scope.objectId, function (details) {
                    // lets find the child entry so we can calculate its correct edit link
                    var link = null;
                    if (details && details.children) {
                        Wiki.log.debug("scanned the directory " + details.children.length + " children");
                        var child = details.children.find(function (c) { return c.name === Wiki.fileName; });
                        if (child) {
                            link = $scope.childLink(child);
                        }
                        else {
                            Wiki.log.debug("Could not find name '" + Wiki.fileName + "' in the list of file names " + JSON.stringify(details.children.map(function (c) { return c.name; })));
                        }
                    }
                    if (!link) {
                        Wiki.log.debug("WARNING: could not find the childLink so reverting to the wiki edit page!");
                        link = Wiki.editLink($scope.branch, path, $location);
                    }
                    //Core.$apply($scope);
                    Wiki.goToLink(link, $timeout, $location);
                });
            });
        }
        function getNewDocumentPath() {
            var template = $scope.selectedCreateDocumentTemplate;
            if (!template) {
                Wiki.log.debug("No template selected.");
                return null;
            }
            var exemplar = template.exemplar || "";
            var name = $scope.newDocumentName || exemplar;
            if (name.indexOf('.') < 0) {
                // lets add the file extension from the exemplar
                var idx = exemplar.lastIndexOf(".");
                if (idx > 0) {
                    name += exemplar.substring(idx);
                }
            }
            // lets deal with directories in the name
            var folder = $scope.pageId;
            if ($scope.isFile) {
                // if we are a file lets discard the last part of the path
                var idx = folder.lastIndexOf("/");
                if (idx <= 0) {
                    folder = "";
                }
                else {
                    folder = folder.substring(0, idx);
                }
            }
            var idx = name.lastIndexOf("/");
            if (idx > 0) {
                folder += "/" + name.substring(0, idx);
                name = name.substring(idx + 1);
            }
            folder = Core.trimLeading(folder, "/");
            return folder + (folder ? "/" : "") + name;
        }
    }]);
})(Wiki || (Wiki = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="../../git/ts/gitHelpers.ts"/>
/// <reference path="../../dozer/ts/dozerHelpers.ts"/>
/// <reference path="wikiHelpers.ts"/>
/// <reference path="wikiPlugin.ts"/>
/**
 * @module Wiki
 */
var Wiki;
(function (Wiki) {
    Wiki._module.controller("Wiki.DozerMappingsController", ["$scope", "$location", "$routeParams", "workspace", "jolokia", "wikiRepository", "$templateCache", function ($scope, $location, $routeParams, workspace, jolokia, wikiRepository, $templateCache) {
        var log = Logger.get("Dozer");
        Wiki.initScope($scope, $routeParams, $location);
        Dozer.schemaConfigure();
        $scope.versionId = $scope.branch || "1.0";
        $scope.schema = {};
        $scope.addDialog = new UI.Dialog();
        $scope.propertiesDialog = new UI.Dialog();
        $scope.deleteDialog = false;
        $scope.unmappedFieldsHasValid = false;
        $scope.modified = false;
        $scope.selectedItems = [];
        $scope.mappings = [];
        $scope.schemas = [];
        $scope.aName = '';
        $scope.bName = '';
        $scope.connectorStyle = ["Bezier"];
        $scope.main = "";
        $scope.tab = "Mappings";
        $scope.gridOptions = {
            selectedItems: $scope.selectedItems,
            data: 'mappings',
            displayFooter: false,
            showFilter: false,
            //sortInfo: { field: 'timestamp', direction: 'DESC'},
            filterOptions: {
                filterText: "searchText"
            },
            columnDefs: [
                {
                    field: 'class_a',
                    displayName: 'From',
                    cellTemplate: '<div class="ngCellText">{{row.entity.class_a.name}}</div>'
                },
                {
                    field: 'class_b',
                    displayName: 'To',
                    cellTemplate: '<div class="ngCellText">{{row.entity.class_b.name}}</div>'
                }
            ]
        };
        $scope.$on("$routeChangeSuccess", function (event, current, previous) {
            // lets do this asynchronously to avoid Error: $digest already in progress
            setTimeout(updateView, 50);
        });
        $scope.triggerRefresh = function (timeout) {
            if (timeout === void 0) { timeout = 500; }
            $scope.main = "";
            setTimeout(function () {
                $scope.main = $templateCache.get("pageTemplate.html");
                Core.$apply($scope);
            }, timeout);
        };
        $scope.disableReload = function () {
            var aValue = Core.pathGet($scope, ["selectedMapping", "class_a", "value"]);
            var bValue = Core.pathGet($scope, ["selectedMapping", "class_b", "value"]);
            return aValue === $scope.aName && bValue === $scope.bName;
        };
        $scope.doReload = function () {
            $scope.selectedMapping.class_a.value = $scope.aName;
            $scope.selectedMapping.class_b.value = $scope.bName;
            $scope.triggerRefresh();
        };
        $scope.$watch('selectedMapping', function (newValue, oldValue) {
            if (newValue !== oldValue) {
                $scope.aName = newValue.class_a.value;
                $scope.bName = newValue.class_b.value;
                $scope.triggerRefresh();
            }
        });
        $scope.$watch('selectedMapping.class_a.value', function (newValue, oldValue) {
            if (newValue !== oldValue && newValue !== '') {
                $scope.fetchProperties(newValue, $scope.selectedMapping.class_a, 'Right');
            }
        });
        $scope.$watch('selectedMapping.class_b.value', function (newValue, oldValue) {
            if (newValue !== oldValue && newValue !== '') {
                $scope.fetchProperties(newValue, $scope.selectedMapping.class_b, 'Left');
            }
        });
        $scope.fetchProperties = function (className, target, anchor) {
            var introspectorMBean = Dozer.getIntrospectorMBean(workspace);
            if (introspectorMBean && !$scope.missingContainer) {
                var aJolokia = $scope.containerJolokia || jolokia;
                aJolokia.request({
                    type: 'exec',
                    mbean: introspectorMBean,
                    operation: 'getProperties(java.lang.String)',
                    arguments: [className]
                }, {
                    success: function (response) {
                        target.error = null;
                        target.properties = response.value;
                        var parentId = '';
                        if (angular.isDefined(target.value)) {
                            parentId = target.value;
                        }
                        else {
                            parentId = target.path;
                        }
                        angular.forEach(target.properties, function (property) {
                            property.id = Core.getUUID();
                            property.path = parentId + '/' + property.displayName;
                            property.anchor = anchor;
                            // TODO - Let's see if we need to do this...
                            /*
                             var lookup = !Dozer.excludedPackages.any((excluded) => { return property.typeName.has(excluded); });
                             if (lookup) {
                             $scope.fetchProperties(property.typeName, property, anchor);
                             }
                             */
                        });
                        Core.$apply($scope);
                    },
                    error: function (response) {
                        target.properties = null;
                        target.error = {
                            'type': response.error_type,
                            'stackTrace': response.error
                        };
                        log.error("got: " + response);
                        Core.$apply($scope);
                    }
                });
            }
        };
        $scope.getSourceAndTarget = function (info) {
            var sourcePath = info.source.attr('field-path');
            var targetPath = info.target.attr('field-path');
            var sourceField = sourcePath.split('/').last();
            var targetField = sourcePath.split('/').last();
            return {
                from: sourceField,
                to: targetField
            };
        };
        function extractProperty(clazz, prop) {
            return (!clazz || !clazz.properties) ? null : clazz.properties.find(function (property) {
                return property.path.endsWith('/' + prop);
            });
        }
        // The jsPlumb directive will call this after it's done it's thing...
        function addConnectionClickHandler(connection, jsplumb) {
            connection.bind('click', function (connection) {
                jsplumb.detach(connection);
            });
        }
        function getPaintStyle() {
            return {
                strokeStyle: UI.colors.sample(),
                lineWidth: 4
            };
        }
        $scope.jsPlumbCallback = function (jsplumb, nodes, nodesById, connections) {
            // Set up any connections loaded from the XML
            // TODO - currently we actually are only looking at the top-level properties
            angular.forEach($scope.selectedMapping.fields, function (field) {
                var a_property = extractProperty($scope.selectedMapping.class_a, field.a.value);
                var b_property = extractProperty($scope.selectedMapping.class_b, field.b.value);
                if (a_property && b_property) {
                    var a_node = nodesById[a_property.id];
                    var b_node = nodesById[b_property.id];
                    var connection = $scope.jsPlumb.connect({
                        source: a_node.el,
                        target: b_node.el
                    }, {
                        connector: $scope.connectorStyle,
                        maxConnections: 1,
                        paintStyle: getPaintStyle()
                    });
                    //Ensure loaded connections can also be removed
                    addConnectionClickHandler(connection, jsplumb);
                    a_node.connections.push(connection);
                    b_node.connections.push(connection);
                }
            });
            // Handle new connection events...
            jsplumb.bind('connection', function (info) {
                // Add a handler so we can click on a connection to make it go away
                addConnectionClickHandler(info.connection, jsplumb);
                info.connection.setPaintStyle(getPaintStyle());
                var newMapping = $scope.getSourceAndTarget(info);
                var field = new Dozer.Field(new Dozer.FieldDefinition(newMapping.from), new Dozer.FieldDefinition(newMapping.to));
                $scope.selectedMapping.fields.push(field);
                $scope.modified = true;
                Core.$apply($scope);
            });
            // Handle connection detach events...
            jsplumb.bind('connectionDetached', function (info) {
                var toDetach = $scope.getSourceAndTarget(info);
                var field = new Dozer.Field(new Dozer.FieldDefinition(toDetach.from), new Dozer.FieldDefinition(toDetach.to));
                $scope.selectedMapping.fields.remove(field);
                $scope.modified = true;
                Core.$apply($scope);
            });
        };
        $scope.formatStackTrace = function (exception) {
            return Log.formatStackTrace(exception);
        };
        $scope.addMapping = function () {
            var treeNode = $scope.rootTreeNode;
            if (treeNode) {
                var parentFolder = treeNode.data;
                var mapping = new Dozer.Mapping();
                var addedNode = Dozer.createMappingFolder(mapping, parentFolder);
                var added = treeNode.addChild(addedNode);
                if (added) {
                    added.expand(true);
                    added.select(true);
                    added.activate(true);
                    onTreeModified();
                }
                $scope.mappings.push(mapping);
                $scope.selectedMapping = mapping;
            }
        };
        $scope.addField = function () {
            if ($scope.selectedMapping) {
                // lets find all the possible unmapped fields we can map from...
                Dozer.findUnmappedFields(workspace, $scope.selectedMapping, function (data) {
                    log.warn("has unmapped data fields: " + data);
                    $scope.unmappedFields = data;
                    $scope.unmappedFieldsHasValid = false;
                    $scope.addDialog.open();
                    Core.$apply($scope);
                });
            }
        };
        $scope.addAndCloseDialog = function () {
            log.info("About to add the unmapped fields " + JSON.stringify($scope.unmappedFields, null, "  "));
            if ($scope.selectedMapping) {
                // TODO whats the folder???
                angular.forEach($scope.unmappedFields, function (unmappedField) {
                    if (unmappedField.valid) {
                        // TODO detect exclude!
                        var field = new Dozer.Field(new Dozer.FieldDefinition(unmappedField.fromField), new Dozer.FieldDefinition(unmappedField.toField));
                        $scope.selectedMapping.fields.push(field);
                        var treeNode = $scope.selectedMappingTreeNode;
                        var mappingFolder = $scope.selectedMappingFolder;
                        if (treeNode && mappingFolder) {
                            var fieldFolder = Dozer.addMappingFieldFolder(field, mappingFolder);
                            var added = treeNode.addChild(fieldFolder);
                            if (added) {
                                added.expand(true);
                                added.select(true);
                                added.activate(true);
                                onTreeModified();
                            }
                        }
                        else {
                            log.warn("No treenode and folder for mapping node! treeNode " + treeNode + " mappingFolder " + mappingFolder);
                        }
                    }
                });
            }
            $scope.addDialog.close();
        };
        $scope.canDelete = function () {
            return $scope.selectedFolder ? true : false;
        };
        $scope.removeNode = function () {
            if ($scope.selectedFolder && $scope.treeNode) {
                // TODO deal with deleting fields
                var folder = $scope.selectedFolder;
                var entity = folder.entity;
                if (entity instanceof Dozer.Field) {
                    // lets remove this from the parent mapping
                    var mapping = Core.pathGet(folder, ["parent", "entity"]);
                    if (mapping) {
                        mapping.fields.remove(entity);
                    }
                }
                $scope.selectedFolder.detach();
                $scope.treeNode.remove();
                $scope.selectedFolder = null;
                $scope.treeNode = null;
                onTreeModified();
            }
        };
        $scope.saveMappings = function () {
            $scope.model.mappings = $scope.mappings;
            var text = Dozer.saveToXmlText($scope.model);
            if (text) {
                var commitMessage = $scope.commitMessage || "Updated page " + $scope.pageId;
                wikiRepository.putPage($scope.branch, $scope.pageId, text, commitMessage, function (status) {
                    Wiki.onComplete(status);
                    $scope.modified = false;
                    Core.notification("success", "Saved " + $scope.pageId);
                    goToView();
                    Core.$apply($scope);
                });
            }
        };
        $scope.save = function () {
            if ($scope.tab === "Mappings") {
                $scope.saveMappings();
                return;
            }
            if ($scope.model) {
                // lets copy the mappings from the tree
                var model = Dozer.loadModelFromTree($scope.rootTreeNode, $scope.model);
                var text = Dozer.saveToXmlText(model);
                if (text) {
                    var commitMessage = $scope.commitMessage || "Updated page " + $scope.pageId;
                    wikiRepository.putPage($scope.branch, $scope.pageId, text, commitMessage, function (status) {
                        Wiki.onComplete(status);
                        $scope.modified = false;
                        Core.notification("success", "Saved " + $scope.pageId);
                        goToView();
                        Core.$apply($scope);
                    });
                }
            }
        };
        $scope.cancel = function () {
            log.info("cancelling...");
            // TODO show dialog if folks are about to lose changes...
        };
        $scope.onRootTreeNode = function (rootTreeNode) {
            $scope.rootTreeNode = rootTreeNode;
        };
        $scope.onNodeSelect = function (folder, treeNode) {
            $scope.selectedFolder = folder;
            $scope.treeNode = treeNode;
            $scope.propertiesTemplate = null;
            $scope.dozerEntity = null;
            $scope.selectedDescription = "";
            $scope.selectedMapping = null;
            $scope.selectedMappingTreeNode = null;
            $scope.selectedMappingFolder = null;
            // now the model is bound, lets add a listener
            if ($scope.removeModelChangeListener) {
                $scope.removeModelChangeListener();
                $scope.removeModelChangeListener = null;
            }
            if (folder) {
                var entity = folder.entity;
                $scope.dozerEntity = entity;
                var propertiesTemplate = "plugins/wiki/html/dozerPropertiesEdit.html";
                if (entity instanceof Dozer.Field) {
                    //var field: Dozer.Field = entity;
                    $scope.propertiesTemplate = propertiesTemplate;
                    $scope.nodeModel = Dozer.io_hawt_dozer_schema_Field;
                    $scope.selectedDescription = "Field Mapping";
                    $scope.selectedMapping = Core.pathGet(folder, ["parent", "entity"]);
                    $scope.selectedMappingFolder = folder.parent;
                    $scope.selectedMappingTreeNode = treeNode.parent;
                }
                else if (entity instanceof Dozer.Mapping) {
                    //var mapping: Dozer.Mapping = entity;
                    $scope.propertiesTemplate = propertiesTemplate;
                    $scope.nodeModel = Dozer.io_hawt_dozer_schema_Mapping;
                    $scope.selectedDescription = "Class Mapping";
                    $scope.selectedMapping = entity;
                    $scope.selectedMappingFolder = folder;
                    $scope.selectedMappingTreeNode = treeNode;
                }
                if ($scope.selectedMapping && !$scope.removeModelChangeListener) {
                }
            }
            Core.$apply($scope);
        };
        $scope.onUnmappedFieldChange = function (unmappedField) {
            unmappedField.valid = unmappedField.toField ? true : false;
            $scope.unmappedFieldsHasValid = $scope.unmappedFields.find(function (f) { return f.valid; });
        };
        function findFieldNames(className, text) {
            //console.log("Finding the to field names for expression '" + text + "'  on class " + className);
            var properties = Dozer.findProperties(workspace, className, text, null);
            return properties.map(function (p) { return p.name; });
        }
        $scope.fromFieldNames = function (text) {
            var className = Core.pathGet($scope.selectedMapping, ["class_a", "value"]);
            return findFieldNames(className, text);
        };
        $scope.toFieldNames = function (text) {
            var className = Core.pathGet($scope.selectedMapping, ["class_b", "value"]);
            return findFieldNames(className, text);
        };
        $scope.classNames = function (text) {
            // lets only query if the size is reasonable
            if (!text || text.length < 2)
                return [];
            return Core.time("Time the query of classes", function () {
                log.info("searching for class names with filter '" + text + "'");
                var answer = Dozer.findClassNames(workspace, text);
                log.info("Found results: " + answer.length);
                return answer;
            });
        };
        updateView();
        function updateView() {
            $scope.pageId = Wiki.pageId($routeParams, $location);
            if (Git.getGitMBean(workspace)) {
                $scope.git = wikiRepository.getPage($scope.branch, $scope.pageId, $scope.objectId, onResults);
            }
        }
        function onResults(response) {
            var text = response.text;
            if (text) {
                if ($scope.responseText !== text) {
                    $scope.responseText = text;
                    // lets remove any dodgy characters so we can use it as a DOM id
                    $scope.model = Dozer.loadDozerModel(text, $scope.pageId);
                    $scope.mappings = Core.pathGet($scope.model, ["mappings"]);
                    $scope.mappingTree = Dozer.createDozerTree($scope.model);
                    if (!angular.isDefined($scope.selectedMapping)) {
                        $scope.selectedMapping = $scope.mappings.first();
                    }
                    $scope.main = $templateCache.get("pageTemplate.html");
                }
            }
            else {
                log.warn("No XML found for page " + $scope.pageId);
            }
            Core.$apply($scope);
        }
        function onTreeModified() {
            $scope.modified = true;
        }
        function goToView() {
            // TODO lets navigate to the view if we have a separate view one day :)
            /*
             if ($scope.breadcrumbs && $scope.breadcrumbs.length > 1) {
             var viewLink = $scope.breadcrumbs[$scope.breadcrumbs.length - 2];
             console.log("goToView has found view " + viewLink);
             var path = Core.trimLeading(viewLink, "#");
             $location.path(path);
             } else {
             console.log("goToView has no breadcrumbs!");
             }
             */
        }
    }]);
})(Wiki || (Wiki = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="../../git/ts/gitHelpers.ts"/>
/// <reference path="wikiHelpers.ts"/>
/// <reference path="wikiPlugin.ts"/>
/**
 * @module Wiki
 */
var Wiki;
(function (Wiki) {
    Wiki._module.controller("Wiki.EditController", ["$scope", "$location", "$routeParams", "fileExtensionTypeRegistry", "wikiRepository", function ($scope, $location, $routeParams, fileExtensionTypeRegistry, wikiRepository) {
        Wiki.initScope($scope, $routeParams, $location);
        $scope.entity = {
            source: null
        };
        var format = Wiki.fileFormat($scope.pageId, fileExtensionTypeRegistry);
        var form = null;
        if ((format && format === "javascript") || isCreate()) {
            form = $location.search()["form"];
        }
        var options = {
            mode: {
                name: format
            }
        };
        $scope.codeMirrorOptions = CodeEditor.createEditorSettings(options);
        $scope.modified = false;
        $scope.isValid = function () { return $scope.fileName; };
        $scope.canSave = function () { return !$scope.modified; };
        $scope.$watch('entity.source', function (newValue, oldValue) {
            $scope.modified = newValue && oldValue && newValue !== oldValue;
        }, true);
        Wiki.log.debug("path: ", $scope.path);
        $scope.$watch('modified', function (newValue, oldValue) {
            Wiki.log.debug("modified: ", newValue);
        });
        $scope.viewLink = function () { return Wiki.viewLink($scope.branch, $scope.pageId, $location, $scope.fileName); };
        $scope.cancel = function () {
            goToView();
        };
        $scope.save = function () {
            if ($scope.modified && $scope.fileName) {
                saveTo($scope["pageId"]);
            }
        };
        $scope.create = function () {
            // lets combine the file name with the current pageId (which is the directory)
            var path = $scope.pageId + "/" + $scope.fileName;
            console.log("creating new file at " + path);
            saveTo(path);
        };
        $scope.onSubmit = function (json, form) {
            if (isCreate()) {
                $scope.create();
            }
            else {
                $scope.save();
            }
        };
        $scope.onCancel = function (form) {
            setTimeout(function () {
                goToView();
                Core.$apply($scope);
            }, 50);
        };
        updateView();
        function isCreate() {
            return $location.path().startsWith("/wiki/create");
        }
        function updateView() {
            // only load the source if not in create mode
            if (isCreate()) {
                updateSourceView();
            }
            else {
                Wiki.log.debug("Getting page, branch: ", $scope.branch, " pageId: ", $scope.pageId, " objectId: ", $scope.objectId);
                wikiRepository.getPage($scope.branch, $scope.pageId, $scope.objectId, onFileContents);
            }
        }
        function onFileContents(details) {
            var contents = details.text;
            $scope.entity.source = contents;
            $scope.fileName = $scope.pageId.split('/').last();
            Wiki.log.debug("file name: ", $scope.fileName);
            Wiki.log.debug("file details: ", details);
            updateSourceView();
            Core.$apply($scope);
        }
        function updateSourceView() {
            if (form) {
                if (isCreate()) {
                    // lets default a file name
                    if (!$scope.fileName) {
                        $scope.fileName = "" + Core.getUUID() + ".json";
                    }
                }
                // now lets try load the form defintion JSON so we can then render the form
                $scope.sourceView = null;
                $scope.git = wikiRepository.getPage($scope.branch, form, $scope.objectId, function (details) {
                    onFormSchema(Wiki.parseJson(details.text));
                });
            }
            else {
                $scope.sourceView = "plugins/wiki/html/sourceEdit.html";
            }
        }
        function onFormSchema(json) {
            $scope.formDefinition = json;
            if ($scope.entity.source) {
                $scope.formEntity = Wiki.parseJson($scope.entity.source);
            }
            $scope.sourceView = "plugins/wiki/html/formEdit.html";
            Core.$apply($scope);
        }
        function goToView() {
            var path = Core.trimLeading($scope.viewLink(), "#");
            Wiki.log.debug("going to view " + path);
            $location.path(Wiki.decodePath(path));
            Wiki.log.debug("location is now " + $location.path());
        }
        function saveTo(path) {
            var commitMessage = $scope.commitMessage || "Updated page " + $scope.pageId;
            var contents = $scope.entity.source;
            if ($scope.formEntity) {
                contents = JSON.stringify($scope.formEntity, null, "  ");
            }
            Wiki.log.debug("Saving file, branch: ", $scope.branch, " path: ", $scope.path);
            //console.log("About to write contents '" + contents + "'");
            wikiRepository.putPage($scope.branch, path, contents, commitMessage, function (status) {
                Wiki.onComplete(status);
                $scope.modified = false;
                Core.notification("success", "Saved " + path);
                goToView();
                Core.$apply($scope);
            });
        }
    }]);
})(Wiki || (Wiki = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="../../git/ts/gitHelpers.ts"/>
/// <reference path="wikiHelpers.ts"/>
/// <reference path="wikiPlugin.ts"/>
/**
 * @module Wiki
 */
var Wiki;
(function (Wiki) {
    Wiki._module.controller("Wiki.FormTableController", ["$scope", "$location", "$routeParams", "workspace", "wikiRepository", function ($scope, $location, $routeParams, workspace, wikiRepository) {
        Wiki.initScope($scope, $routeParams, $location);
        $scope.columnDefs = [];
        $scope.gridOptions = {
            data: 'list',
            displayFooter: false,
            showFilter: false,
            filterOptions: {
                filterText: ''
            },
            columnDefs: $scope.columnDefs
        };
        $scope.viewLink = function (row) {
            return childLink(row, "/view");
        };
        $scope.editLink = function (row) {
            return childLink(row, "/edit");
        };
        function childLink(child, prefix) {
            var start = Wiki.startLink($scope.branch);
            var childId = (child) ? child["_id"] || "" : "";
            return Core.createHref($location, start + prefix + "/" + $scope.pageId + "/" + childId);
        }
        var linksColumn = {
            field: '_id',
            displayName: 'Actions',
            cellTemplate: '<div class="ngCellText""><a ng-href="{{viewLink(row.entity)}}" class="btn">View</a> <a ng-href="{{editLink(row.entity)}}" class="btn">Edit</a></div>'
        };
        $scope.$watch('workspace.tree', function () {
            if (!$scope.git && Git.getGitMBean(workspace)) {
                // lets do this asynchronously to avoid Error: $digest already in progress
                //console.log("Reloading the view as we now seem to have a git mbean!");
                setTimeout(updateView, 50);
            }
        });
        $scope.$on("$routeChangeSuccess", function (event, current, previous) {
            // lets do this asynchronously to avoid Error: $digest already in progress
            setTimeout(updateView, 50);
        });
        var form = $location.search()["form"];
        if (form) {
            wikiRepository.getPage($scope.branch, form, $scope.objectId, onFormData);
        }
        updateView();
        function onResults(response) {
            var list = [];
            var map = Wiki.parseJson(response);
            angular.forEach(map, function (value, key) {
                value["_id"] = key;
                list.push(value);
            });
            $scope.list = list;
            Core.$apply($scope);
        }
        function updateView() {
            var filter = Core.pathGet($scope, ["gridOptions", "filterOptions", "filterText"]) || "";
            $scope.git = wikiRepository.jsonChildContents($scope.pageId, "*.json", filter, onResults);
        }
        function onFormData(details) {
            var text = details.text;
            if (text) {
                $scope.formDefinition = Wiki.parseJson(text);
                var columnDefs = [];
                var schema = $scope.formDefinition;
                angular.forEach(schema.properties, function (property, name) {
                    if (name) {
                        if (!Forms.isArrayOrNestedObject(property, schema)) {
                            var colDef = {
                                field: name,
                                displayName: property.description || name,
                                visible: true
                            };
                            columnDefs.push(colDef);
                        }
                    }
                });
                columnDefs.push(linksColumn);
                $scope.columnDefs = columnDefs;
                $scope.gridOptions.columnDefs = columnDefs;
                // now we have the grid column stuff loaded, lets load the datatable
                $scope.tableView = "plugins/wiki/html/formTableDatatable.html";
            }
        }
        Core.$apply($scope);
    }]);
})(Wiki || (Wiki = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="wikiHelpers.ts"/>
/// <reference path="wikiPlugin.ts"/>
/**
 * @module Wiki
 */
var Wiki;
(function (Wiki) {
    Wiki._module.controller("Wiki.GitPreferences", ["$scope", "localStorage", "userDetails", function ($scope, localStorage, userDetails) {
        var config = {
            properties: {
                gitUserName: {
                    type: 'string',
                    label: 'Username',
                    description: 'The user name to be used when making changes to files with the source control system'
                },
                gitUserEmail: {
                    type: 'string',
                    label: 'Email',
                    description: 'The email address to use when making changes to files with the source control system'
                }
            }
        };
        $scope.entity = $scope;
        $scope.config = config;
        Core.initPreferenceScope($scope, localStorage, {
            'gitUserName': {
                'value': userDetails.username || ""
            },
            'gitUserEmail': {
                'value': ''
            }
        });
    }]);
})(Wiki || (Wiki = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="../../git/ts/gitHelpers.ts"/>
/// <reference path="wikiHelpers.ts"/>
/// <reference path="wikiPlugin.ts"/>
/**
 * @module Wiki
 */
var Wiki;
(function (Wiki) {
    Wiki._module.controller("Wiki.HistoryController", ["$scope", "$location", "$routeParams", "$templateCache", "workspace", "marked", "fileExtensionTypeRegistry", "wikiRepository", "jolokia", function ($scope, $location, $routeParams, $templateCache, workspace, marked, fileExtensionTypeRegistry, wikiRepository, jolokia) {
        var isFmc = Wiki.isFMCContainer(workspace);
        Wiki.initScope($scope, $routeParams, $location);
        $scope.selectedItems = [];
        // TODO we could configure this?
        $scope.dateFormat = 'EEE, MMM d, y : hh:mm:ss a';
        $scope.gridOptions = {
            data: 'logs',
            showFilter: false,
            selectedItems: $scope.selectedItems,
            showSelectionCheckbox: true,
            displaySelectionCheckbox: true,
            filterOptions: {
                filterText: ''
            },
            columnDefs: [
                {
                    field: 'commitHashText',
                    displayName: 'Change',
                    cellTemplate: $templateCache.get('changeCellTemplate.html'),
                    cellFilter: "",
                    width: "*"
                },
                {
                    field: 'date',
                    displayName: 'Modified',
                    cellFilter: "date: dateFormat",
                    width: "**"
                },
                {
                    field: 'author',
                    displayName: 'Author',
                    cellFilter: "",
                    width: "**"
                },
                {
                    field: 'shortMessage',
                    displayName: 'Message',
                    cellTemplate: '<div class="ngCellText" title="{{row.entity.shortMessage}}">{{row.entity.trimmedMessage}}</div>',
                    cellFilter: "",
                    width: "****"
                }
            ]
        };
        $scope.$on("$routeChangeSuccess", function (event, current, previous) {
            // lets do this asynchronously to avoid Error: $digest already in progress
            setTimeout(updateView, 50);
        });
        $scope.$watch('workspace.tree', function () {
            if (!$scope.git && Git.getGitMBean(workspace)) {
                // lets do this asynchronously to avoid Error: $digest already in progress
                //console.log("Reloading the view as we now seem to have a git mbean!");
                setTimeout(updateView, 50);
            }
        });
        $scope.canRevert = function () {
            return $scope.selectedItems.length === 1 && $scope.selectedItems[0] !== $scope.logs[0];
        };
        $scope.revert = function () {
            if ($scope.selectedItems.length > 0) {
                var objectId = $scope.selectedItems[0].name;
                if (objectId) {
                    var commitMessage = "Reverting file " + $scope.pageId + " to previous version " + objectId;
                    wikiRepository.revertTo($scope.branch, objectId, $scope.pageId, commitMessage, function (result) {
                        Wiki.onComplete(result);
                        // now lets update the view
                        Core.notification('success', "Successfully reverted " + $scope.pageId);
                        updateView();
                    });
                }
                $scope.selectedItems.splice(0, $scope.selectedItems.length);
            }
        };
        $scope.diff = function () {
            var defaultValue = " ";
            var objectId = defaultValue;
            if ($scope.selectedItems.length > 0) {
                objectId = $scope.selectedItems[0].name || defaultValue;
            }
            var baseObjectId = defaultValue;
            if ($scope.selectedItems.length > 1) {
                baseObjectId = $scope.selectedItems[1].name || defaultValue;
                // make the objectId (the one that will start with b/ path) always newer than baseObjectId
                if ($scope.selectedItems[0].date < $scope.selectedItems[1].date) {
                    var _ = baseObjectId;
                    baseObjectId = objectId;
                    objectId = _;
                }
            }
            var link = Wiki.startLink($scope.branch) + "/diff/" + $scope.pageId + "/" + objectId + "/" + baseObjectId;
            var path = Core.trimLeading(link, "#");
            $location.path(path);
        };
        updateView();
        function updateView() {
            var objectId = "";
            var limit = 0;
            $scope.git = wikiRepository.history($scope.branch, objectId, $scope.pageId, limit, function (logArray) {
                angular.forEach(logArray, function (log) {
                    // lets use the shorter hash for links by default
                    var commitId = log.commitHashText || log.name;
                    log.commitLink = Wiki.startLink($scope.branch) + "/commit/" + $scope.pageId + "/" + commitId;
                });
                $scope.logs = logArray;
                Core.$apply($scope);
            });
            Wiki.loadBranches(jolokia, wikiRepository, $scope, isFmc);
        }
    }]);
})(Wiki || (Wiki = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="../../git/ts/gitHelpers.ts"/>
/// <reference path="wikiHelpers.ts"/>
/// <reference path="wikiPlugin.ts"/>
/**
 * @module Wiki
 */
var Wiki;
(function (Wiki) {
    Wiki._module.controller("Wiki.NavBarController", ["$scope", "$location", "$routeParams", "workspace", "jolokia", "wikiRepository", "wikiBranchMenu", function ($scope, $location, $routeParams, workspace, jolokia, wikiRepository, wikiBranchMenu) {
        var isFmc = Wiki.isFMCContainer(workspace);
        Wiki.initScope($scope, $routeParams, $location);
        $scope.branchMenuConfig = {
            title: $scope.branch,
            items: []
        };
        $scope.ViewMode = Wiki.ViewMode;
        $scope.setViewMode = function (mode) {
            $scope.$emit('Wiki.SetViewMode', mode);
        };
        wikiBranchMenu.applyMenuExtensions($scope.branchMenuConfig.items);
        $scope.$watch('branches', function (newValue, oldValue) {
            if (newValue === oldValue || !newValue) {
                return;
            }
            $scope.branchMenuConfig.items = [];
            if (newValue.length > 0) {
                $scope.branchMenuConfig.items.push({
                    heading: isFmc ? "Versions" : "Branches"
                });
            }
            newValue.sort().forEach(function (item) {
                var menuItem = {
                    title: item,
                    icon: '',
                    action: function () {
                    }
                };
                if (item === $scope.branch) {
                    menuItem.icon = "fa fa-ok";
                }
                else {
                    menuItem.action = function () {
                        var targetUrl = Wiki.branchLink(item, $scope.pageId, $location);
                        $location.path(Core.toPath(targetUrl));
                        Core.$apply($scope);
                    };
                }
                $scope.branchMenuConfig.items.push(menuItem);
            });
            wikiBranchMenu.applyMenuExtensions($scope.branchMenuConfig.items);
        }, true);
        $scope.createLink = function () {
            var pageId = Wiki.pageId($routeParams, $location);
            return Wiki.createLink($scope.branch, pageId, $location, $scope);
        };
        $scope.startLink = Wiki.startLink($scope.branch);
        $scope.sourceLink = function () {
            var path = $location.path();
            var answer = null;
            angular.forEach(Wiki.customViewLinks($scope), function (link) {
                if (path.startsWith(link)) {
                    answer = Core.createHref($location, Wiki.startLink($scope.branch) + "/view" + path.substring(link.length));
                }
            });
            // remove the form parameter on view/edit links
            return (!answer && $location.search()["form"]) ? Core.createHref($location, "#" + path, ["form"]) : answer;
        };
        $scope.isActive = function (href) {
            if (!href) {
                return false;
            }
            return href.endsWith($routeParams['page']);
        };
        $scope.$on("$routeChangeSuccess", function (event, current, previous) {
            // lets do this asynchronously to avoid Error: $digest already in progress
            setTimeout(loadBreadcrumbs, 50);
        });
        loadBreadcrumbs();
        function switchFromViewToCustomLink(breadcrumb, link) {
            var href = breadcrumb.href;
            if (href) {
                breadcrumb.href = href.replace("wiki/view", link);
            }
        }
        function loadBreadcrumbs() {
            var start = Wiki.startLink($scope.branch);
            var href = start + "/view";
            $scope.breadcrumbs = [
                { href: href, name: "root" }
            ];
            var path = Wiki.pageId($routeParams, $location);
            var array = path ? path.split("/") : [];
            angular.forEach(array, function (name) {
                if (!name.startsWith("/") && !href.endsWith("/")) {
                    href += "/";
                }
                href += Wiki.encodePath(name);
                if (!name.isBlank()) {
                    $scope.breadcrumbs.push({ href: href, name: name });
                }
            });
            // lets swizzle the last one or two to be formTable views if the last or 2nd to last
            var loc = $location.path();
            if ($scope.breadcrumbs.length) {
                var last = $scope.breadcrumbs[$scope.breadcrumbs.length - 1];
                // possibly trim any required file extensions
                last.name = Wiki.hideFileNameExtensions(last.name);
                var swizzled = false;
                angular.forEach(Wiki.customViewLinks($scope), function (link) {
                    if (!swizzled && loc.startsWith(link)) {
                        // lets swizzle the view to the current link
                        switchFromViewToCustomLink($scope.breadcrumbs.last(), Core.trimLeading(link, "/"));
                        swizzled = true;
                    }
                });
                if (!swizzled && $location.search()["form"]) {
                    var lastName = $scope.breadcrumbs.last().name;
                    if (lastName && lastName.endsWith(".json")) {
                        // previous breadcrumb should be a formTable
                        switchFromViewToCustomLink($scope.breadcrumbs[$scope.breadcrumbs.length - 2], "wiki/formTable");
                    }
                }
            }
            /*
            if (loc.startsWith("/wiki/history") || loc.startsWith("/wiki/version")
              || loc.startsWith("/wiki/diff") || loc.startsWith("/wiki/commit")) {
              // lets add a history tab
              $scope.breadcrumbs.push({href: "#/wiki/history/" + path, name: "History"});
            } else if ($scope.branch) {
              var prefix ="/wiki/branch/" + $scope.branch;
              if (loc.startsWith(prefix + "/history") || loc.startsWith(prefix + "/version")
                || loc.startsWith(prefix + "/diff") || loc.startsWith(prefix + "/commit")) {
                // lets add a history tab
                $scope.breadcrumbs.push({href: "#/wiki/branch/" + $scope.branch + "/history/" + path, name: "History"});
              }
            }
            */
            var name = null;
            if (loc.startsWith("/wiki/version")) {
                // lets add a version tab
                name = ($routeParams["objectId"] || "").substring(0, 6) || "Version";
                $scope.breadcrumbs.push({ href: "#" + loc, name: name });
            }
            if (loc.startsWith("/wiki/diff")) {
                // lets add a version tab
                var v1 = ($routeParams["objectId"] || "").substring(0, 6);
                var v2 = ($routeParams["baseObjectId"] || "").substring(0, 6);
                name = "Diff";
                if (v1) {
                    if (v2) {
                        name += " " + v1 + " " + v2;
                    }
                    else {
                        name += " " + v1;
                    }
                }
                $scope.breadcrumbs.push({ href: "#" + loc, name: name });
            }
            Core.$apply($scope);
        }
    }]);
})(Wiki || (Wiki = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="../../git/ts/gitHelpers.ts"/>
/// <reference path="wikiHelpers.ts"/>
/// <reference path="wikiPlugin.ts"/>
/**
 * @module Wiki
 */
var Wiki;
(function (Wiki) {
    // controller for handling file drops
    Wiki.FileDropController = Wiki._module.controller("Wiki.FileDropController", ["$scope", "FileUploader", "$route", "$timeout", "userDetails", function ($scope, FileUploader, $route, $timeout, userDetails) {
        var uploadURI = Wiki.gitRestURL($scope.branch, $scope.pageId) + '/';
        var uploader = $scope.uploader = new FileUploader({
            headers: {
                'Authorization': Core.authHeaderValue(userDetails)
            },
            autoUpload: true,
            withCredentials: true,
            method: 'POST',
            url: uploadURI
        });
        $scope.doUpload = function () {
            uploader.uploadAll();
        };
        uploader.onWhenAddingFileFailed = function (item /*{File|FileLikeObject}*/, filter, options) {
            Wiki.log.debug('onWhenAddingFileFailed', item, filter, options);
        };
        uploader.onAfterAddingFile = function (fileItem) {
            Wiki.log.debug('onAfterAddingFile', fileItem);
        };
        uploader.onAfterAddingAll = function (addedFileItems) {
            Wiki.log.debug('onAfterAddingAll', addedFileItems);
        };
        uploader.onBeforeUploadItem = function (item) {
            if ('file' in item) {
                item.fileSizeMB = (item.file.size / 1024 / 1024).toFixed(2);
            }
            else {
                item.fileSizeMB = 0;
            }
            //item.url = UrlHelpers.join(uploadURI, item.file.name);
            item.url = uploadURI;
            Wiki.log.info("Loading files to " + uploadURI);
            Wiki.log.debug('onBeforeUploadItem', item);
        };
        uploader.onProgressItem = function (fileItem, progress) {
            Wiki.log.debug('onProgressItem', fileItem, progress);
        };
        uploader.onProgressAll = function (progress) {
            Wiki.log.debug('onProgressAll', progress);
        };
        uploader.onSuccessItem = function (fileItem, response, status, headers) {
            Wiki.log.debug('onSuccessItem', fileItem, response, status, headers);
        };
        uploader.onErrorItem = function (fileItem, response, status, headers) {
            Wiki.log.debug('onErrorItem', fileItem, response, status, headers);
        };
        uploader.onCancelItem = function (fileItem, response, status, headers) {
            Wiki.log.debug('onCancelItem', fileItem, response, status, headers);
        };
        uploader.onCompleteItem = function (fileItem, response, status, headers) {
            Wiki.log.debug('onCompleteItem', fileItem, response, status, headers);
        };
        uploader.onCompleteAll = function () {
            Wiki.log.debug('onCompleteAll');
            uploader.clearQueue();
            $timeout(function () {
                Wiki.log.info("Completed all uploads. Lets force a reload");
                $route.reload();
                Core.$apply($scope);
            }, 200);
        };
    }]);
    // main page controller
    Wiki.ViewController = Wiki._module.controller("Wiki.ViewController", ["$scope", "$location", "$routeParams", "$route", "$http", "$timeout", "workspace", "marked", "fileExtensionTypeRegistry", "wikiRepository", "$compile", "$templateCache", "jolokia", "localStorage", "$interpolate", "$dialog", function ($scope, $location, $routeParams, $route, $http, $timeout, workspace, marked, fileExtensionTypeRegistry, wikiRepository, $compile, $templateCache, jolokia, localStorage, $interpolate, $dialog) {
        $scope.name = "WikiViewController";
        var isFmc = Wiki.isFMCContainer(workspace);
        Wiki.initScope($scope, $routeParams, $location);
        SelectionHelpers.decorate($scope);
        $scope.fabricTopLevel = "fabric/profiles/";
        $scope.versionId = $scope.branch;
        $scope.paneTemplate = '';
        $scope.profileId = "";
        $scope.showProfileHeader = false;
        $scope.showAppHeader = false;
        $scope.operationCounter = 1;
        $scope.renameDialog = null;
        $scope.moveDialog = null;
        $scope.deleteDialog = null;
        $scope.isFile = false;
        $scope.rename = {
            newFileName: ""
        };
        $scope.move = {
            moveFolder: ""
        };
        $scope.ViewMode = Wiki.ViewMode;
        // bind filter model values to search params...
        Core.bindModelToSearchParam($scope, $location, "searchText", "q", "");
        StorageHelpers.bindModelToLocalStorage({
            $scope: $scope,
            $location: $location,
            localStorage: localStorage,
            modelName: 'mode',
            paramName: 'wikiViewMode',
            initialValue: 0 /* List */,
            to: Core.numberToString,
            from: Core.parseIntValue
        });
        // only reload the page if certain search parameters change
        Core.reloadWhenParametersChange($route, $scope, $location, ['wikiViewMode']);
        $scope.gridOptions = {
            data: 'children',
            displayFooter: false,
            selectedItems: [],
            showSelectionCheckbox: true,
            enableSorting: false,
            useExternalSorting: true,
            columnDefs: [
                {
                    field: 'name',
                    displayName: 'Name',
                    cellTemplate: $templateCache.get('fileCellTemplate.html'),
                    headerCellTemplate: $templateCache.get('fileColumnTemplate.html')
                }
            ]
        };
        $scope.$on('Wiki.SetViewMode', function ($event, mode) {
            $scope.mode = mode;
            switch (mode) {
                case 0 /* List */:
                    Wiki.log.debug("List view mode");
                    break;
                case 1 /* Icon */:
                    Wiki.log.debug("Icon view mode");
                    break;
                default:
                    $scope.mode = 0 /* List */;
                    Wiki.log.debug("Defaulting to list view mode");
                    break;
            }
        });
        $scope.childActions = [];
        var maybeUpdateView = Core.throttled(updateView, 1000);
        $scope.marked = function (text) {
            if (text) {
                return marked(text);
            }
            else {
                return '';
            }
        };
        $scope.$on('wikiBranchesUpdated', function () {
            updateView();
        });
        $scope.createDashboardLink = function () {
            var href = '/wiki/branch/:branch/view/*page';
            var page = $routeParams['page'];
            var title = page ? page.split("/").last() : null;
            var size = angular.toJson({
                size_x: 2,
                size_y: 2
            });
            var answer = "#/dashboard/add?tab=dashboard" + "&href=" + encodeURIComponent(href) + "&size=" + encodeURIComponent(size) + "&routeParams=" + encodeURIComponent(angular.toJson($routeParams));
            if (title) {
                answer += "&title=" + encodeURIComponent(title);
            }
            return answer;
        };
        $scope.displayClass = function () {
            if (!$scope.children || $scope.children.length === 0) {
                return "";
            }
            return "span9";
        };
        $scope.parentLink = function () {
            var start = Wiki.startLink($scope.branch);
            var prefix = start + "/view";
            //log.debug("pageId: ", $scope.pageId)
            var parts = $scope.pageId.split("/");
            //log.debug("parts: ", parts);
            var path = "/" + parts.first(parts.length - 1).join("/");
            //log.debug("path: ", path);
            return Core.createHref($location, prefix + path, []);
        };
        $scope.childLink = function (child) {
            var start = Wiki.startLink($scope.branch);
            var prefix = start + "/view";
            var postFix = "";
            var path = Wiki.encodePath(child.path);
            if (child.directory) {
                // if we are a folder with the same name as a form file, lets add a form param...
                var formPath = path + ".form";
                var children = $scope.children;
                if (children) {
                    var formFile = children.find(function (child) {
                        return child['path'] === formPath;
                    });
                    if (formFile) {
                        prefix = start + "/formTable";
                        postFix = "?form=" + formPath;
                    }
                }
            }
            else {
                var xmlNamespaces = child.xmlNamespaces;
                if (xmlNamespaces && xmlNamespaces.length) {
                    if (xmlNamespaces.any(function (ns) { return Wiki.camelNamespaces.any(ns); })) {
                        prefix = start + "/camel/canvas";
                    }
                    else if (xmlNamespaces.any(function (ns) { return Wiki.dozerNamespaces.any(ns); })) {
                        prefix = start + "/dozer/mappings";
                    }
                    else {
                        Wiki.log.debug("child " + path + " has namespaces " + xmlNamespaces);
                    }
                }
                if (child.path.endsWith(".form")) {
                    postFix = "?form=/";
                }
                else if (Wiki.isIndexPage(child.path)) {
                    // lets default to book view on index pages
                    prefix = start + "/book";
                }
            }
            return Core.createHref($location, prefix + path + postFix, ["form"]);
        };
        $scope.fileName = function (entity) {
            return Wiki.hideFileNameExtensions(entity.displayName || entity.name);
        };
        $scope.fileClass = function (entity) {
            if (entity.name.has(".profile")) {
                return "green";
            }
            return "";
        };
        $scope.fileIconHtml = function (entity) {
            return Wiki.fileIconHtml(entity);
        };
        $scope.format = Wiki.fileFormat($scope.pageId, fileExtensionTypeRegistry);
        var options = {
            readOnly: true,
            mode: {
                name: $scope.format
            }
        };
        $scope.codeMirrorOptions = CodeEditor.createEditorSettings(options);
        $scope.editLink = function () {
            var pageName = ($scope.directory) ? $scope.readMePath : $scope.pageId;
            return (pageName) ? Wiki.editLink($scope.branch, pageName, $location) : null;
        };
        $scope.branchLink = function (branch) {
            if (branch) {
                return Wiki.branchLink(branch, $scope.pageId, $location);
            }
            return null;
        };
        $scope.historyLink = "#/wiki" + ($scope.branch ? "/branch/" + $scope.branch : "") + "/history/" + $scope.pageId;
        $scope.$watch('workspace.tree', function () {
            if (!$scope.git && Git.getGitMBean(workspace)) {
                // lets do this asynchronously to avoid Error: $digest already in progress
                //log.info("Reloading view as the tree changed and we have a git mbean now");
                setTimeout(maybeUpdateView, 50);
            }
        });
        $scope.$on("$routeChangeSuccess", function (event, current, previous) {
            // lets do this asynchronously to avoid Error: $digest already in progress
            //log.info("Reloading view due to $routeChangeSuccess");
            setTimeout(maybeUpdateView, 50);
        });
        $scope.openDeleteDialog = function () {
            if ($scope.gridOptions.selectedItems.length) {
                $scope.selectedFileHtml = "<ul>" + $scope.gridOptions.selectedItems.map(function (file) { return "<li>" + file.name + "</li>"; }).sort().join("") + "</ul>";
                if ($scope.gridOptions.selectedItems.find(function (file) {
                    return file.name.endsWith(".profile");
                })) {
                    $scope.deleteWarning = "You are about to delete document(s) which represent Fabric8 profile(s). This really can't be undone! Wiki operations are low level and may lead to non-functional state of Fabric.";
                }
                else {
                    $scope.deleteWarning = null;
                }
                $scope.deleteDialog = Wiki.getDeleteDialog($dialog, {
                    callbacks: function () {
                        return $scope.deleteAndCloseDialog;
                    },
                    selectedFileHtml: function () {
                        return $scope.selectedFileHtml;
                    },
                    warning: function () {
                        return $scope.deleteWarning;
                    }
                });
                $scope.deleteDialog.open();
            }
            else {
                Wiki.log.debug("No items selected right now! " + $scope.gridOptions.selectedItems);
            }
        };
        $scope.deleteAndCloseDialog = function () {
            var files = $scope.gridOptions.selectedItems;
            var fileCount = files.length;
            Wiki.log.debug("Deleting selection: " + files);
            angular.forEach(files, function (file, idx) {
                var path = $scope.pageId + "/" + file.name;
                Wiki.log.debug("About to delete " + path);
                $scope.git = wikiRepository.removePage($scope.branch, path, null, function (result) {
                    if (idx + 1 === fileCount) {
                        $scope.gridOptions.selectedItems.splice(0, fileCount);
                        var message = Core.maybePlural(fileCount, "document");
                        Core.notification("success", "Deleted " + message);
                        Core.$apply($scope);
                        updateView();
                    }
                });
            });
            $scope.deleteDialog.close();
        };
        $scope.$watch("rename.newFileName", function () {
            // ignore errors if the file is the same as the rename file!
            var path = getRenameFilePath();
            if ($scope.originalRenameFilePath === path) {
                $scope.fileExists = { exists: false, name: null };
            }
            else {
                checkFileExists(path);
            }
        });
        $scope.renameAndCloseDialog = function () {
            if ($scope.gridOptions.selectedItems.length) {
                var selected = $scope.gridOptions.selectedItems[0];
                var newPath = getRenameFilePath();
                if (selected && newPath) {
                    var oldName = selected.name;
                    var newName = Wiki.fileName(newPath);
                    var oldPath = $scope.pageId + "/" + oldName;
                    Wiki.log.debug("About to rename file " + oldPath + " to " + newPath);
                    $scope.git = wikiRepository.rename($scope.branch, oldPath, newPath, null, function (result) {
                        Core.notification("success", "Renamed file to  " + newName);
                        $scope.gridOptions.selectedItems.splice(0, 1);
                        $scope.renameDialog.close();
                        Core.$apply($scope);
                        updateView();
                    });
                }
            }
            $scope.renameDialog.close();
        };
        $scope.openRenameDialog = function () {
            var name = null;
            if ($scope.gridOptions.selectedItems.length) {
                var selected = $scope.gridOptions.selectedItems[0];
                name = selected.name;
            }
            if (name) {
                $scope.rename.newFileName = name;
                $scope.originalRenameFilePath = getRenameFilePath();
                $scope.renameDialog = Wiki.getRenameDialog($dialog, {
                    rename: function () {
                        return $scope.rename;
                    },
                    fileExists: function () {
                        return $scope.fileExists;
                    },
                    fileName: function () {
                        return $scope.fileName;
                    },
                    callbacks: function () {
                        return $scope.renameAndCloseDialog;
                    }
                });
                $scope.renameDialog.open();
                $timeout(function () {
                    $('#renameFileName').focus();
                }, 50);
            }
            else {
                Wiki.log.debug("No items selected right now! " + $scope.gridOptions.selectedItems);
            }
        };
        $scope.moveAndCloseDialog = function () {
            var files = $scope.gridOptions.selectedItems;
            var fileCount = files.length;
            var moveFolder = $scope.move.moveFolder;
            var oldFolder = $scope.pageId;
            if (moveFolder && fileCount && moveFolder !== oldFolder) {
                Wiki.log.debug("Moving " + fileCount + " file(s) to " + moveFolder);
                angular.forEach(files, function (file, idx) {
                    var oldPath = oldFolder + "/" + file.name;
                    var newPath = moveFolder + "/" + file.name;
                    Wiki.log.debug("About to move " + oldPath + " to " + newPath);
                    $scope.git = wikiRepository.rename($scope.branch, oldPath, newPath, null, function (result) {
                        if (idx + 1 === fileCount) {
                            $scope.gridOptions.selectedItems.splice(0, fileCount);
                            var message = Core.maybePlural(fileCount, "document");
                            Core.notification("success", "Moved " + message + " to " + newPath);
                            $scope.moveDialog.close();
                            Core.$apply($scope);
                            updateView();
                        }
                    });
                });
            }
            $scope.moveDialog.close();
        };
        $scope.folderNames = function (text) {
            return wikiRepository.completePath($scope.branch, text, true, null);
        };
        $scope.openMoveDialog = function () {
            if ($scope.gridOptions.selectedItems.length) {
                $scope.move.moveFolder = $scope.pageId;
                $scope.moveDialog = Wiki.getMoveDialog($dialog, {
                    move: function () {
                        return $scope.move;
                    },
                    folderNames: function () {
                        return $scope.folderNames;
                    },
                    callbacks: function () {
                        return $scope.moveAndCloseDialog;
                    }
                });
                $scope.moveDialog.open();
                $timeout(function () {
                    $('#moveFolder').focus();
                }, 50);
            }
            else {
                Wiki.log.debug("No items selected right now! " + $scope.gridOptions.selectedItems);
            }
        };
        setTimeout(maybeUpdateView, 50);
        function isDiffView() {
            var path = $location.path();
            return path && (path.startsWith("/wiki/diff") || path.startsWith("/wiki/branch/" + $scope.branch + "/diff"));
        }
        function updateView() {
            if (isDiffView()) {
                var baseObjectId = $routeParams["baseObjectId"];
                $scope.git = wikiRepository.diff($scope.objectId, baseObjectId, $scope.pageId, onFileDetails);
            }
            else {
                $scope.git = wikiRepository.getPage($scope.branch, $scope.pageId, $scope.objectId, onFileDetails);
            }
            Wiki.loadBranches(jolokia, wikiRepository, $scope, isFmc);
        }
        $scope.updateView = updateView;
        function viewContents(pageName, contents) {
            $scope.sourceView = null;
            var format = null;
            if (isDiffView()) {
                format = "diff";
            }
            else {
                format = Wiki.fileFormat(pageName, fileExtensionTypeRegistry) || $scope.format;
            }
            Wiki.log.debug("File format: ", format);
            switch (format) {
                case "image":
                    var imageURL = 'git/' + $scope.branch;
                    Wiki.log.debug("$scope: ", $scope);
                    imageURL = UrlHelpers.join(imageURL, $scope.pageId);
                    var interpolateFunc = $interpolate($templateCache.get("imageTemplate.html"));
                    $scope.html = interpolateFunc({
                        imageURL: imageURL
                    });
                    break;
                case "markdown":
                    $scope.html = contents ? marked(contents) : "";
                    break;
                case "javascript":
                    var form = null;
                    form = $location.search()["form"];
                    $scope.source = contents;
                    $scope.form = form;
                    if (form) {
                        // now lets try load the form JSON so we can then render the form
                        $scope.sourceView = null;
                        $scope.git = wikiRepository.getPage($scope.branch, form, $scope.objectId, function (details) {
                            onFormSchema(Wiki.parseJson(details.text));
                        });
                    }
                    else {
                        $scope.sourceView = "plugins/wiki/html/sourceView.html";
                    }
                    break;
                default:
                    $scope.html = null;
                    $scope.source = contents;
                    $scope.sourceView = "plugins/wiki/html/sourceView.html";
            }
            Core.$apply($scope);
        }
        function onFormSchema(json) {
            $scope.formDefinition = json;
            if ($scope.source) {
                $scope.formEntity = Wiki.parseJson($scope.source);
            }
            $scope.sourceView = "plugins/wiki/html/formView.html";
            Core.$apply($scope);
        }
        function onFileDetails(details) {
            var contents = details.text;
            $scope.directory = details.directory;
            $scope.fileDetails = details;
            if (details && details.format) {
                $scope.format = details.format;
            }
            else {
                $scope.format = Wiki.fileFormat($scope.pageId, fileExtensionTypeRegistry);
            }
            $scope.codeMirrorOptions.mode.name = $scope.format;
            $scope.children = null;
            if (details.directory) {
                var directories = details.children.filter(function (dir) {
                    return dir.directory && !dir.name.has(".profile");
                });
                var profiles = details.children.filter(function (dir) {
                    return dir.directory && dir.name.has(".profile");
                });
                var files = details.children.filter(function (file) {
                    return !file.directory;
                });
                directories = directories.sortBy(function (dir) {
                    return dir.name;
                });
                profiles = profiles.sortBy(function (dir) {
                    return dir.name;
                });
                files = files.sortBy(function (file) {
                    return file.name;
                }).sortBy(function (file) {
                    return file.name.split('.').last();
                });
                // Also enrich the response with the current branch, as that's part of the coordinate for locating the actual file in git
                $scope.children = Array.create(directories, profiles, files).map(function (file) {
                    file.branch = $scope.branch;
                    file.fileName = file.name;
                    if (file.directory) {
                        file.fileName += ".zip";
                    }
                    file.downloadURL = Wiki.gitRestURL($scope.branch, file.path);
                    return file;
                });
            }
            $scope.html = null;
            $scope.source = null;
            $scope.readMePath = null;
            $scope.isFile = false;
            if ($scope.children) {
                $scope.$broadcast('pane.open');
                // if we have a readme then lets render it...
                var item = $scope.children.find(function (info) {
                    var name = (info.name || "").toLowerCase();
                    var ext = Wiki.fileExtension(name);
                    return name && ext && ((name.startsWith("readme.") || name === "readme") || (name.startsWith("index.") || name === "index"));
                });
                if (item) {
                    var pageName = item.path;
                    $scope.readMePath = pageName;
                    wikiRepository.getPage($scope.branch, pageName, $scope.objectId, function (readmeDetails) {
                        viewContents(pageName, readmeDetails.text);
                    });
                }
                var kubernetesJson = $scope.children.find(function (child) {
                    var name = (child.name || "").toLowerCase();
                    var ext = Wiki.fileExtension(name);
                    return name && ext && name.startsWith("kubernetes") && ext === "json";
                });
                if (kubernetesJson) {
                    wikiRepository.getPage($scope.branch, kubernetesJson.path, undefined, function (json) {
                        if (json && json.text) {
                            try {
                                $scope.kubernetesJson = angular.fromJson(json.text);
                            }
                            catch (e) {
                                $scope.kubernetesJson = {
                                    errorParsing: true,
                                    error: e
                                };
                            }
                            $scope.showAppHeader = true;
                            Core.$apply($scope);
                        }
                    });
                }
                $scope.$broadcast('Wiki.ViewPage.Children', $scope.pageId, $scope.children);
            }
            else {
                $scope.$broadcast('pane.close');
                var pageName = $scope.pageId;
                viewContents(pageName, contents);
                $scope.isFile = true;
            }
            Core.$apply($scope);
        }
        function checkFileExists(path) {
            $scope.operationCounter += 1;
            var counter = $scope.operationCounter;
            if (path) {
                wikiRepository.exists($scope.branch, path, function (result) {
                    // filter old results
                    if ($scope.operationCounter === counter) {
                        Wiki.log.debug("checkFileExists for path " + path + " got result " + result);
                        $scope.fileExists.exists = result ? true : false;
                        $scope.fileExists.name = result ? result.name : null;
                        Core.$apply($scope);
                    }
                    else {
                    }
                });
            }
        }
        // Called by hawtio TOC directive...
        $scope.getContents = function (filename, cb) {
            var pageId = filename;
            if ($scope.directory) {
                pageId = $scope.pageId + '/' + filename;
            }
            else {
                var pathParts = $scope.pageId.split('/');
                pathParts = pathParts.remove(pathParts.last());
                pathParts.push(filename);
                pageId = pathParts.join('/');
            }
            Wiki.log.debug("pageId: ", $scope.pageId);
            Wiki.log.debug("branch: ", $scope.branch);
            Wiki.log.debug("filename: ", filename);
            Wiki.log.debug("using pageId: ", pageId);
            wikiRepository.getPage($scope.branch, pageId, undefined, function (data) {
                cb(data.text);
            });
        };
        function getRenameFilePath() {
            var newFileName = $scope.rename.newFileName;
            return ($scope.pageId && newFileName) ? $scope.pageId + "/" + newFileName : null;
        }
    }]);
})(Wiki || (Wiki = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="wikiHelpers.ts"/>
/// <reference path="wikiPlugin.ts"/>
var Wiki;
(function (Wiki) {
    function getRenameDialog($dialog, $scope) {
        return $dialog.dialog({
            resolve: $scope,
            templateUrl: 'plugins/wiki/html/modal/renameDialog.html',
            controller: ["$scope", "dialog", "callbacks", "rename", "fileExists", "fileName", function ($scope, dialog, callbacks, rename, fileExists, fileName) {
                $scope.rename = rename;
                $scope.fileExists = fileExists;
                $scope.fileName = fileName;
                $scope.close = function (result) {
                    dialog.close();
                };
                $scope.renameAndCloseDialog = callbacks;
            }]
        });
    }
    Wiki.getRenameDialog = getRenameDialog;
    function getMoveDialog($dialog, $scope) {
        return $dialog.dialog({
            resolve: $scope,
            templateUrl: 'plugins/wiki/html/modal/moveDialog.html',
            controller: ["$scope", "dialog", "callbacks", "move", "folderNames", function ($scope, dialog, callbacks, move, folderNames) {
                $scope.move = move;
                $scope.folderNames = folderNames;
                $scope.close = function (result) {
                    dialog.close();
                };
                $scope.moveAndCloseDialog = callbacks;
            }]
        });
    }
    Wiki.getMoveDialog = getMoveDialog;
    function getDeleteDialog($dialog, $scope) {
        return $dialog.dialog({
            resolve: $scope,
            templateUrl: 'plugins/wiki/html/modal/deleteDialog.html',
            controller: ["$scope", "dialog", "callbacks", "selectedFileHtml", "warning", function ($scope, dialog, callbacks, selectedFileHtml, warning) {
                $scope.selectedFileHtml = selectedFileHtml;
                $scope.close = function (result) {
                    dialog.close();
                };
                $scope.deleteAndCloseDialog = callbacks;
                $scope.warning = warning;
            }]
        });
    }
    Wiki.getDeleteDialog = getDeleteDialog;
})(Wiki || (Wiki = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="wikiHelpers.ts"/>
/// <reference path="wikiPlugin.ts"/>
var Wiki;
(function (Wiki) {
    Wiki._module.directive('wikiHrefAdjuster', ["$location", function ($location) {
        return {
            restrict: 'A',
            link: function ($scope, $element, $attr) {
                $element.bind('DOMNodeInserted', function (event) {
                    var ays = $element.find('a');
                    angular.forEach(ays, function (a) {
                        if (a.hasAttribute('no-adjust')) {
                            return;
                        }
                        a = $(a);
                        var href = (a.attr('href') || "").trim();
                        if (href) {
                            var fileExtension = a.attr('file-extension');
                            var newValue = Wiki.adjustHref($scope, $location, href, fileExtension);
                            if (newValue) {
                                a.attr('href', newValue);
                            }
                        }
                    });
                    var imgs = $element.find('img');
                    angular.forEach(imgs, function (a) {
                        if (a.hasAttribute('no-adjust')) {
                            return;
                        }
                        a = $(a);
                        var href = (a.attr('src') || "").trim();
                        if (href) {
                            if (href.startsWith("/")) {
                                href = Core.url(href);
                                a.attr('src', href);
                                // lets avoid this element being reprocessed
                                a.attr('no-adjust', 'true');
                            }
                        }
                    });
                });
            }
        };
    }]);
    Wiki._module.directive('wikiTitleLinker', ["$location", function ($location) {
        return {
            restrict: 'A',
            link: function ($scope, $element, $attr) {
                var loaded = false;
                function offsetTop(elements) {
                    if (elements) {
                        var offset = elements.offset();
                        if (offset) {
                            return offset.top;
                        }
                    }
                    return 0;
                }
                function scrollToHash() {
                    var answer = false;
                    var id = $location.search()["hash"];
                    return scrollToId(id);
                }
                function scrollToId(id) {
                    var answer = false;
                    var id = $location.search()["hash"];
                    if (id) {
                        var selector = 'a[name="' + id + '"]';
                        var targetElements = $element.find(selector);
                        if (targetElements && targetElements.length) {
                            var scrollDuration = 1;
                            var delta = offsetTop($($element));
                            var top = offsetTop(targetElements) - delta;
                            if (top < 0) {
                                top = 0;
                            }
                            //log.info("scrolling to hash: " + id + " top: " + top + " delta:" + delta);
                            $('body,html').animate({
                                scrollTop: top
                            }, scrollDuration);
                            answer = true;
                        }
                        else {
                        }
                    }
                    return answer;
                }
                function addLinks(event) {
                    var headings = $element.find('h1,h2,h3,h4,h5,h6,h7');
                    var updated = false;
                    angular.forEach(headings, function (he) {
                        var h1 = $(he);
                        // now lets try find a child header
                        var a = h1.parent("a");
                        if (!a || !a.length) {
                            var text = h1.text();
                            if (text) {
                                var target = text.replace(/ /g, "-");
                                var pathWithHash = "#" + $location.path() + "?hash=" + target;
                                var link = Core.createHref($location, pathWithHash, ['hash']);
                                // lets wrap the heading in a link
                                var newA = $('<a name="' + target + '" href="' + link + '" ng-click="onLinkClick()"></a>');
                                newA.on("click", function () {
                                    setTimeout(function () {
                                        if (scrollToId(target)) {
                                        }
                                    }, 50);
                                });
                                newA.insertBefore(h1);
                                h1.detach();
                                newA.append(h1);
                                updated = true;
                            }
                        }
                    });
                    if (updated && !loaded) {
                        setTimeout(function () {
                            if (scrollToHash()) {
                                loaded = true;
                            }
                        }, 50);
                    }
                }
                function onEventInserted(event) {
                    // avoid any more events while we do our thing
                    $element.unbind('DOMNodeInserted', onEventInserted);
                    addLinks(event);
                    $element.bind('DOMNodeInserted', onEventInserted);
                }
                $element.bind('DOMNodeInserted', onEventInserted);
            }
        };
    }]);
})(Wiki || (Wiki = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="../../git/ts/gitHelpers.ts"/>
/// <reference path="wikiHelpers.ts"/>
/// <reference path="wikiPlugin.ts"/>
/**
 * @module Wiki
 */
var Wiki;
(function (Wiki) {
    /**
     * @class GitWikiRepository
     */
    var GitWikiRepository = (function () {
        function GitWikiRepository(factoryMethod) {
            this.factoryMethod = factoryMethod;
            this.directoryPrefix = "";
        }
        GitWikiRepository.prototype.getRepositoryLabel = function (fn, error) {
            this.git().getRepositoryLabel(fn, error);
        };
        GitWikiRepository.prototype.exists = function (branch, path, fn) {
            var fullPath = this.getPath(path);
            return this.git().exists(branch, fullPath, fn);
        };
        GitWikiRepository.prototype.completePath = function (branch, completionText, directoriesOnly, fn) {
            return this.git().completePath(branch, completionText, directoriesOnly, fn);
        };
        GitWikiRepository.prototype.getPage = function (branch, path, objectId, fn) {
            var _this = this;
            var git = this.git();
            path = path || "/";
            if (git) {
                if (objectId) {
                    var blobPath = this.getLogPath(path);
                    // TODO deal with versioned directories?
                    git.getContent(objectId, blobPath, function (content) {
                        var details = {
                            text: content,
                            directory: false
                        };
                        fn(details);
                    });
                }
                else {
                    var fullPath = this.getPath(path);
                    git.read(branch, fullPath, function (details) {
                        // lets fix up any paths to be relative to the wiki
                        var children = details.children;
                        angular.forEach(children, function (child) {
                            var path = child.path;
                            if (path) {
                                var directoryPrefix = "/" + _this.directoryPrefix;
                                if (path.startsWith(directoryPrefix)) {
                                    path = "/" + path.substring(directoryPrefix.length);
                                    child.path = path;
                                }
                            }
                        });
                        fn(details);
                    });
                }
            }
            return git;
        };
        /**
         * Performs a diff on the versions
         * @method diff
         * @for GitWikiRepository
         * @param {String} objectId
         * @param {String} baseObjectId
         * @param {String} path
         * @param {Function} fn
         * @return {any}
         */
        GitWikiRepository.prototype.diff = function (objectId, baseObjectId, path, fn) {
            var fullPath = this.getLogPath(path);
            var git = this.git();
            if (git) {
                git.diff(objectId, baseObjectId, fullPath, function (content) {
                    var details = {
                        text: content,
                        format: "diff",
                        directory: false
                    };
                    fn(details);
                });
            }
            return git;
        };
        GitWikiRepository.prototype.commitInfo = function (commitId, fn) {
            this.git().commitInfo(commitId, fn);
        };
        GitWikiRepository.prototype.commitTree = function (commitId, fn) {
            this.git().commitTree(commitId, fn);
        };
        GitWikiRepository.prototype.putPage = function (branch, path, contents, commitMessage, fn) {
            var fullPath = this.getPath(path);
            this.git().write(branch, fullPath, commitMessage, contents, fn);
        };
        GitWikiRepository.prototype.putPageBase64 = function (branch, path, contents, commitMessage, fn) {
            var fullPath = this.getPath(path);
            this.git().writeBase64(branch, fullPath, commitMessage, contents, fn);
        };
        GitWikiRepository.prototype.createDirectory = function (branch, path, commitMessage, fn) {
            var fullPath = this.getPath(path);
            this.git().createDirectory(branch, fullPath, commitMessage, fn);
        };
        GitWikiRepository.prototype.revertTo = function (branch, objectId, blobPath, commitMessage, fn) {
            var fullPath = this.getLogPath(blobPath);
            this.git().revertTo(branch, objectId, fullPath, commitMessage, fn);
        };
        GitWikiRepository.prototype.rename = function (branch, oldPath, newPath, commitMessage, fn) {
            var fullOldPath = this.getPath(oldPath);
            var fullNewPath = this.getPath(newPath);
            if (!commitMessage) {
                commitMessage = "Renaming page " + oldPath + " to " + newPath;
            }
            this.git().rename(branch, fullOldPath, fullNewPath, commitMessage, fn);
        };
        GitWikiRepository.prototype.removePage = function (branch, path, commitMessage, fn) {
            var fullPath = this.getPath(path);
            if (!commitMessage) {
                commitMessage = "Removing page " + path;
            }
            this.git().remove(branch, fullPath, commitMessage, fn);
        };
        /**
         * Returns the full path to use in the git repo
         * @method getPath
         * @for GitWikiRepository
         * @param {String} path
         * @return {String{
         */
        GitWikiRepository.prototype.getPath = function (path) {
            var directoryPrefix = this.directoryPrefix;
            return (directoryPrefix) ? directoryPrefix + path : path;
        };
        GitWikiRepository.prototype.getLogPath = function (path) {
            return Core.trimLeading(this.getPath(path), "/");
        };
        /**
         * Return the history of the repository or a specific directory or file path
         * @method history
         * @for GitWikiRepository
         * @param {String} branch
         * @param {String} objectId
         * @param {String} path
         * @param {Number} limit
         * @param {Function} fn
         * @return {any}
         */
        GitWikiRepository.prototype.history = function (branch, objectId, path, limit, fn) {
            var fullPath = this.getLogPath(path);
            var git = this.git();
            if (git) {
                git.history(branch, objectId, fullPath, limit, fn);
            }
            return git;
        };
        /**
         * Get the contents of a blobPath for a given commit objectId
         * @method getContent
         * @for GitWikiRepository
         * @param {String} objectId
         * @param {String} blobPath
         * @param {Function} fn
         * @return {any}
         */
        GitWikiRepository.prototype.getContent = function (objectId, blobPath, fn) {
            var fullPath = this.getLogPath(blobPath);
            var git = this.git();
            if (git) {
                git.getContent(objectId, fullPath, fn);
            }
            return git;
        };
        /**
         * Get the list of branches
         * @method branches
         * @for GitWikiRepository
         * @param {Function} fn
         * @return {any}
         */
        GitWikiRepository.prototype.branches = function (fn) {
            var git = this.git();
            if (git) {
                git.branches(fn);
            }
            return git;
        };
        /**
         * Get the JSON contents of the path with optional name wildcard and search
         * @method jsonChildContents
         * @for GitWikiRepository
         * @param {String} path
         * @param {String} nameWildcard
         * @param {String} search
         * @param {Function} fn
         * @return {any}
         */
        GitWikiRepository.prototype.jsonChildContents = function (path, nameWildcard, search, fn) {
            var fullPath = this.getLogPath(path);
            var git = this.git();
            if (git) {
                git.readJsonChildContent(fullPath, nameWildcard, search, fn);
            }
            return git;
        };
        GitWikiRepository.prototype.git = function () {
            var repository = this.factoryMethod();
            if (!repository) {
                console.log("No repository yet! TODO we should use a local impl!");
            }
            return repository;
        };
        return GitWikiRepository;
    })();
    Wiki.GitWikiRepository = GitWikiRepository;
})(Wiki || (Wiki = {}));

/// <reference path="../../includes.ts"/>
/// <reference path="../../git/ts/gitHelpers.ts"/>
/// <reference path="wikiHelpers.ts"/>
/// <reference path="wikiPlugin.ts"/>
var Wiki;
(function (Wiki) {
    Wiki.TopLevelController = Wiki._module.controller("Wiki.TopLevelController", ['$scope', 'workspace', '$route', '$routeParams', function ($scope, workspace, $route, $routeParams) {
        /*
        TODO
            $scope.managerMBean = Fabric.managerMBean;
            $scope.clusterBootstrapManagerMBean = Fabric.clusterBootstrapManagerMBean;
            $scope.clusterManagerMBean = Fabric.clusterManagerMBean;
            $scope.openShiftFabricMBean = Fabric.openShiftFabricMBean;
            $scope.mqManagerMBean = Fabric.mqManagerMBean;
            $scope.healthMBean = Fabric.healthMBean;
            $scope.schemaLookupMBean = Fabric.schemaLookupMBean;
            $scope.gitMBean = Git.getGitMBean(workspace);
            $scope.configAdminMBean = Osgi.getHawtioConfigAdminMBean(workspace);
        */
    }]);
})(Wiki || (Wiki = {}));

angular.module("hawtio-wiki-templates", []).run(["$templateCache", function($templateCache) {$templateCache.put("plugins/docker-registry/html/layoutDockerRegistry.html","<div class=\"row\" ng-controller=\"DockerRegistry.TopLevel\">\n  <div class=\"col-md-12\">\n    <div ng-view></div>\n  </div>\n</div>\n");
$templateCache.put("plugins/docker-registry/html/list.html","<div class=\"row\" ng-controller=\"DockerRegistry.ListController\">\n  <script type=\"text/ng-template\" id=\"tagsTemplate.html\">\n    <ul class=\"zebra-list\">\n      <li ng-repeat=\"(name, imageId) in row.entity.tags\" ng-controller=\"DockerRegistry.TagController\">\n        <a href=\"\" ng-click=\"selectImage(imageId)\">{{name}}</a>\n      </li>\n    </ul>\n  </script>\n  <p></p>\n  <div class=\"row\">\n    <div class=\"col-md-12\">\n      <span ng-hide=\"selectedImage\">\n        <hawtio-filter ng-model=\"tableConfig.filterOptions.filterText\"\n                       css-class=\"input-xxlarge\"\n                       placeholder=\"Filter images...\"\n                       save-as=\"docker-registry-image-list-text-filter\"></hawtio-filter>\n      </span>\n      <button class=\"pull-right btn btn-danger\"\n              ng-disabled=\"tableConfig.selectedItems.length == 0\"\n              ng-hide=\"selectedImage\"\n              ng-click=\"deletePrompt(tableConfig.selectedItems)\"><i class=\"fa fa-remove\"></i> Delete</button>\n      <span class=\"pull-right\">&nbsp;</span>\n      <button class=\"pull-right btn btn-primary\" \n              ng-show=\"selectedImage\"\n              ng-click=\"selectedImage = undefined\"><i class=\"fa fa-list\"></i></button>\n    </div>\n  </div>\n  <p></p>\n  <div class=\"row\" ng-show=\"!fetched\">\n    <div class=\"col-md-12\">\n      <p class=\"text-center\"><i class=\"fa fa-spinner icon-spin\"></i></p>\n    </div>\n  </div>\n  <div class=\"row\" ng-show=\"fetched && !selectedImage && imageRepositories.length === 0\">\n    <div class=\"col-md-12\">\n      <p class=\"alert alert-info\">No images are stored in this repository</p>\n    </div>\n  </div>\n  <div class=\"row\" ng-show=\"fetched && !selectedImage && imageRepositories.length\">\n    <div class=\"col-md-12\">\n      <table class=\"table table-condensed table-striped\"\n             hawtio-simple-table=\"tableConfig\"></table>\n    </div>\n  </div>\n  <div class=\"row\" ng-show=\"fetched && selectedImage\">\n    <div class=\"col-md-12\">\n      <div hawtio-object=\"selectedImage\"></div>\n    </div>\n  </div>\n</div>\n\n");
$templateCache.put("plugins/maven/html/advancedSearch.html","<div ng-controller=\"Maven.SearchController\">\n  <div style=\"height: 8em;\" ng-hide=\"artifacts.length > 0\"></div>\n\n  <div class=\"row\">\n    <div class=\"control-group\">\n      <div class=\"controls inline-block\" style=\"white-space: nowrap;\">\n        <form class=\"form-horizontal\">\n          <div class=\"control-group\">\n            <label class=\"control-label\" for=\"searchGroupId\">Maven coordinates:</label>\n\n            <div class=\"controls\">\n              <input type=\"text\" id=\"searchGroupId\" ng-model=\"form.searchGroup\" placeholder=\"Group ID\">\n              <input type=\"text\" id=\"searchArtifactId\" ng-model=\"form.searchArtifact\" placeholder=\"Artifact ID\">\n              <input type=\"text\" id=\"searchVersion\" ng-model=\"form.searchVersion\" placeholder=\"Version\">\n            </div>\n          </div>\n          <div class=\"control-group\">\n            <label class=\"control-label\" for=\"searchPackaging\">Packaging:</label>\n\n            <div class=\"controls\">\n              <input type=\"text\" id=\"searchPackaging\" ng-model=\"form.searchPackaging\" placeholder=\"Packaging\">\n              <input type=\"text\" id=\"searchClassifier\" ng-model=\"form.searchClassifier\" placeholder=\"Classifier\">\n            </div>\n          </div>\n          <div class=\"control-group\">\n            <label class=\"control-label\" for=\"searchClassName\">Class name:</label>\n\n            <div class=\"controls\">\n              <input type=\"text\" id=\"searchClassName\" class=\"input-xxlarge\" ng-model=\"form.searchClassName\" placeholder=\"Class name\">\n            </div>\n          </div>\n          <div class=\"control-group\">\n            <div class=\"controls\">\n              <button type=\"submit\" class=\"btn\" ng-disabled=\"!hasAdvancedSearch(form)\" ng-click=\"doSearch()\"\n                      title=\"Search the maven repositories for artifacts containing this text\" data-placement=\"bottom\">\n                <i class=\"fa fa-search\"></i> Search\n              </button>\n            </div>\n          </div>\n        </form>\n      </div>\n    </div>\n  </div>\n\n  <ng-include src=\"\'plugins/maven/html/searchResults.html\'\"></ng-include>\n</div>\n");
$templateCache.put("plugins/maven/html/artifact.html","<div class=\"controller-section\" ng-controller=\"Maven.ArtifactController\">\n  <div class=\"row\">\n    <div class=\"pull-right\">\n      <a class=\"btn\" href=\"{{versionsLink(row)}}\">Versions</a>\n      <a class=\"btn\" href=\"{{dependenciesLink(row)}}\" ng-show=\"{{hasDependencyMBean()}}\">Dependencies</a>\n      <a class=\"btn\" target=\"javadoc\" href=\"{{javadocLink(row)}}\">JavaDoc</a>\n      <a class=\"btn\" target=\"source\" href=\"{{sourceLink(row)}}\">Source</a>\n    </div>\n    <div title=\"Name\" class=\"title\">\n      <p>\n        {{row.name}}\n      </p>\n\n      <p>\n        {{row.description}}\n      </p>\n    </div>\n  </div>\n  <div class=\"row\">\n    <div title=\"Description\" class=\"title\">\n      <i class=\"expandable-indicator\"></i> pom.xml\n    </div>\n    <ng-include src=\"\'plugins/maven/html/pom.html\'\"></ng-include>\n  </div>\n</div>\n</div>\n");
$templateCache.put("plugins/maven/html/dependencies.html","<div class=\"controller-section\" ng-controller=\"Maven.DependenciesController\">\n  <div class=\"pull-right\">\n    <button class=\"btn\" ng-click=\"viewDetails()\" ng-disabled=\"!validSelection()\">View details</button>\n  </div>\n  <div class=\"row\">\n    <div hawtio-tree=\"dependencyTree\" onselect=\"onSelectNode\" onRoot=\"onRootNode\" activateNodes=\"dependencyActivations\" hideRoot=\"true\" ></div>\n  </div>\n</div>\n");
$templateCache.put("plugins/maven/html/layoutMaven.html","<ul class=\"nav nav-tabs\" ng-controller=\"Core.NavBarController\">\n  <li ng-class=\'{active : isActive(\"#/maven/search\")}\'>\n    <a ng-href=\"{{link(\'#/maven/search\')}}\">Search</a>\n  </li>\n  <li ng-class=\'{active : isActive(\"#/maven/advancedSearch\")}\'>\n    <a ng-href=\"{{link(\'#/maven/advancedSearch\')}}\">Advanced Search</a>\n  </li>\n</ul>\n<div class=\"row\">\n  <div ng-view></div>\n</div>\n\n\n");
$templateCache.put("plugins/maven/html/pom.html","<div class=\"expandable-body well editor-autoresize\" ng-controller=\"Maven.PomXmlController\">\n  <div class=\"CodeMirror cm-s-default CodeMirror-wrap\">\n    <div class=\"CodeMirror-lines\">\n<pre>\n<span class=\"cm-tag\">&lt;dependency&gt;</span>\n  <span class=\"cm-tag\">&lt;groupId&gt;</span><span class=\"cm-string\">{{row.groupId}}</span><span class=\"cm-tag\">&lt;/groupId&gt;</span>\n  <span class=\"cm-tag\">&lt;artifactId&gt;</span><span class=\"cm-string\">{{row.artifactId}}</span><span class=\"cm-tag\">&lt;/artifactId&gt;</span>\n  <span class=\"cm-tag\">&lt;version&gt;</span><span class=\"cm-string\">{{row.version}}</span><span class=\"cm-tag\">&lt;/version&gt;</span>\n<span class=\"cm-tag\">&lt;/dependency&gt;</span>\n</pre>\n    </div>\n  </div>\n</div>\n");
$templateCache.put("plugins/maven/html/search.html","<div ng-controller=\"Maven.SearchController\">\n  <div style=\"height: 8em;\" ng-hide=\"artifacts.length > 0\"></div>\n  <div class=\"row\">\n    <form class=\"form-inline no-bottom-margin\">\n      <div class=\"control-group\" style=\"text-align: center;\">\n        <div class=\"controls inline-block\" style=\"white-space: nowrap;\">\n          <input class=\"search-query col-md-10\" type=\"text\" id=\"mavenSearch\" ng-model=\"form.searchText\"\n                 placeholder=\"Search maven repositories...\">\n\n          <select ng-model=\"form.artifactType\">\n          	<option value=\"\">any artifact</option>\n            <!-- camel component does not work\n            <option value=\"properties/camelComponent\">camel component</option>\n            -->\n            <option value=\"className\">class name</option>\n            <option value=\"ear\">ear</option>\n          	<option value=\"xml/features\">karaf feature</option>\n          	<option value=\"maven-archetype/\">maven archetype</option>\n          	<option value=\"war\">war</option>\n            <option value=\"wsdl\">wsdl</option>\n          	<option value=\"xsd\">xsd</option>\n          </select>\n\n          <button type=\"submit\" class=\"btn\" ng-disabled=\"!form.searchText && !form.artifactType\" ng-click=\"doSearch()\"\n                  title=\"Search the maven repositories for artifacts containing this text\" data-placement=\"bottom\">\n            <i class=\"fa fa-search\"></i> Search\n          </button>\n        </div>\n      </div>\n    </form>\n  </div>\n\n  <ng-include src=\"\'plugins/maven/html/searchResults.html\'\"></ng-include>\n</div>\n");
$templateCache.put("plugins/maven/html/searchResults.html","<div ng-show=\"tooManyResponses != \'\' && done\">\n  <p class=\"alert alert-warning\">{{tooManyResponses}}</p>\n</div>\n<div ng-show=\"artifacts.length > 0\" class=\"controller-section\">\n  <div class=\"gridStyle\" hawtio-datatable=\"gridOptions\"></div>\n</div>\n<div ng-show=\"inProgress\" class=\"controller-section centered\">\n  <p>Searching in progress...</p>\n</div>\n<div ng-show=\"artifacts.length == 0 && done\" class=\"controller-section centered\">\n  <p>No results found</p>\n</div>\n\n<script type=\"text/ng-template\" id=\"artifactDetailTemplate\">\n  <div class=\"pull-right\">\n    <a class=\"btn\" href=\"{{versionsLink(row)}}\">Versions</a>\n    <a class=\"btn\" href=\"{{dependenciesLink(row)}}\" ng-show=\"{{hasDependencyMBean()}}\">Dependencies</a>\n    <a class=\"btn\" target=\"javadoc\" href=\"{{javadocLink(row)}}\">JavaDoc</a>\n    <a class=\"btn\" target=\"source\" href=\"{{sourceLink(row)}}\">Source</a>\n  </div>\n  <div title=\"Name\" class=\"title\">\n    <p>\n      {{row.name}}\n    </p>\n\n    <p>\n      {{row.description}}\n    </p>\n  </div>\n  <div class=\"expandable opened\">\n    <div title=\"Description\" class=\"title\">\n      <i class=\"expandable-indicator\"></i> pom.xml\n    </div>\n    <ng-include src=\"\'plugins/maven/html/pom.html\'\"></ng-include>\n  </div>\n</script>\n");
$templateCache.put("plugins/maven/html/test.html","<div ng-controller=\"Maven.TestController\">\n\n  <div class=\"row\">\n\n    <script type=\"text/ng-template\" id=\"mavenCompletionTemplate\">\n      <div>\n        <p>Maven completion</p>\n        <p>Model: {{someUri}}</p>\n        <p>uriParts</p>\n        <ol>\n          <li ng-repeat=\"part in uriParts\">{{part}}</li>\n        </ol>\n        <input class=\"input-xlarge\" type=\"text\" ng-model=\"someUri\" typeahead=\"name for name in doCompletionMaven($viewValue) | filter:$viewValue\" typeahead-wait-ms=\"200\">\n      </div>\n    </script>\n    <div hawtio-editor=\"mavenCompletion\" mode=\"html\"></div>\n    <div compile=\"mavenCompletion\"></div>\n\n    <!--\n    <div class=\"col-md-3\">\n      <p>Fabric completion</p>\n      <p>Model: {{someUri2}}</p>\n      <p>uriParts</p>\n      <ol>\n        <li ng-repeat=\"part in uriParts2\">{{part}}</li>\n      </ol>\n      <input class=\"input-xlarge\" type=\"text\" ng-model=\"someUri2\" typeahead=\"name for name in doCompletionFabric($viewValue) | filter:$viewValue\" typeahead-wait-ms=\"200\">\n    </div>\n    -->\n  </div>\n\n\n</div>\n");
$templateCache.put("plugins/maven/html/versions.html","<div class=\"controller-section\" ng-controller=\"Maven.VersionsController\">\n  <div class=\"row\">\n    <form class=\"form-horizontal no-bottom-margin\">\n      <fieldset>\n        <div class=\"control-group\">\n          <input class=\"search-query col-md-12\" type=\"text\" ng-model=\"search\"\n                 placeholder=\"Filter versions\">\n        </div>\n      </fieldset>\n    </form>\n  </div>\n  <div class=\"row\">\n    <ng-include src=\"\'plugins/maven/html/searchResults.html\'\"></ng-include>\n  </div>\n</div>\n");
$templateCache.put("plugins/maven/html/view.html","<div ng-controller=\"Maven.ViewController\">\n\n</div>");
$templateCache.put("plugins/wiki/exemplar/document.html","<h2>This is a title</h2>\n\n<p>Here are some notes</p>");
$templateCache.put("plugins/wiki/html/commit.html","<link rel=\"stylesheet\" href=\"plugins/wiki/css/wiki.css\" type=\"text/css\"/>\n\n<div ng-controller=\"Wiki.CommitController\">\n  <script type=\"text/ng-template\" id=\"fileCellTemplate.html\">\n    <div class=\"ngCellText\">\n      <a ng-href=\"{{row.entity.fileLink}}\" class=\"file-name\"\n         title=\"{{row.entity.title}}\">\n        <span class=\"file-icon\" ng-class=\"row.entity.fileClass\" ng-bind-html-unsafe=\"row.entity.fileIconHtml\"></span>\n        <span ng-class=\"row.entity.changeClass\">{{row.entity.path}}</span>\n      </a>\n    </div>\n  </script>\n\n  <div ng-hide=\"inDashboard\" class=\"logbar\" ng-controller=\"Wiki.NavBarController\">\n    <div class=\"wiki logbar-container\">\n      <ul class=\"nav nav-tabs\">\n        <li ng-show=\"branches.length || branch\" class=\"dropdown\">\n          <a href=\"#\" class=\"dropdown-toggle\" data-toggle=\"dropdown\"\n             title=\"The branch to view\">\n            {{branch || \'branch\'}}\n            <span class=\"caret\"></span>\n          </a>\n          <ul class=\"dropdown-menu\">\n            <li ng-repeat=\"otherBranch in branches\">\n              <a ng-href=\"{{branchLink(otherBranch)}}{{hash}}\"\n                 ng-hide=\"otherBranch === branch\"\n                 title=\"Switch to the {{otherBranch}} branch\"\n                 data-placement=\"bottom\">\n                {{otherBranch}}</a>\n            </li>\n          </ul>\n        </li>\n        <li ng-repeat=\"link in breadcrumbs\">\n          <a ng-href=\"{{link.href}}{{hash}}\">{{link.name}}</a>\n        </li>\n        <li>\n          <a ng-href=\"{{historyLink}}{{hash}}\">History</a>\n        </li>\n        <li title=\"{{commitInfo.shortMessage}}\" class=\"active\">\n          <a class=\"commit-id\">{{commitInfo.commitHashText}}</a>\n        </li>\n        <li class=\"pull-right\">\n        <span class=\"commit-author\">\n          <i class=\"fa fa-user\"></i> {{commitInfo.author}}\n        </span>\n        </li>\n        <li class=\"pull-right\">\n          <span class=\"commit-date\">{{commitInfo.date | date: dateFormat}}</span>\n        </li>\n      </ul>\n    </div>\n  </div>\n\n  <div class=\"wiki-fixed row\">\n    <div class=\"commit-message\" title=\"{{commitInfo.shortMessage}}\">\n      {{commitInfo.trimmedMessage}}\n    </div>\n  </div>\n\n  <div class=\"row\">\n    <div class=\"col-md-4\">\n      <div class=\"control-group\">\n        <button class=\"btn\" ng-disabled=\"!selectedItems.length\" ng-click=\"diff()\"\n                title=\"Compare the selected versions of the files to see how they differ\"><i class=\"fa fa-exchange\"></i>\n          Compare\n        </button>\n\n        <!--\n                <button class=\"btn\" ng-disabled=\"!canRevert()\" ng-click=\"revert()\"\n                        title=\"Revert to this version of the file\"><i class=\"fa fa-exchange\"></i> Revert\n                </button>\n        -->\n      </div>\n    </div>\n    <div class=\"col-md-8\">\n      <div class=\"control-group\">\n        <input class=\"col-md-12 search-query\" type=\"text\" ng-model=\"gridOptions.filterOptions.filterText\"\n               placeholder=\"search\">\n      </div>\n    </div>\n  </div>\n\n  <div class=\"form-horizontal\">\n    <div class=\"row\">\n      <table class=\"table-condensed table-striped\" hawtio-simple-table=\"gridOptions\"></table>\n    </div>\n  </div>\n\n</div>\n");
$templateCache.put("plugins/wiki/html/configuration.html","<div ng-hide=\"inDashboard\" class=\"logbar\" ng-controller=\"Wiki.NavBarController\">\n  <div class=\"wiki logbar-container\">\n    <ul class=\"nav nav-tabs\">\n      <li ng-show=\"branches.length || branch\" class=\"dropdown\">\n        <a href=\"#\" class=\"dropdown-toggle\" data-toggle=\"dropdown\"\n           title=\"The branch to view\">\n          {{branch || \'branch\'}}\n          <span class=\"caret\"></span>\n        </a>\n        <ul class=\"dropdown-menu\">\n          <li ng-repeat=\"otherBranch in branches\">\n            <a ng-href=\"{{branchLink(otherBranch)}}{{hash}}\"\n               ng-hide=\"otherBranch === branch\"\n               title=\"Switch to the {{otherBranch}} branch\"\n               data-placement=\"bottom\">\n              {{otherBranch}}</a>\n          </li>\n        </ul>\n      </li>\n      <li ng-repeat=\"link in breadcrumbs\">\n        <a ng-href=\"{{link.href}}{{hash}}\">{{link.name}}</a>\n      </li>\n      <li class=\"ng-scope\">\n        <a ng-href=\"{{startLink}}/configurations/{{pageId}}\">configuration</a>\n      </li>\n      <li class=\"ng-scope active\">\n        <a>pid</a>\n      </li>\n    </ul>\n  </div>\n</div>\n<div class=\"wiki-fixed\">\n  <div class=\"controller-section\" ng-controller=\"Osgi.PidController\">\n    <div ng-include src=\"\'plugins/osgi/html/pid-details.html\'\"></div>\n  </div>\n</div>\n");
$templateCache.put("plugins/wiki/html/configurations.html","<div ng-hide=\"inDashboard\" class=\"logbar\" ng-controller=\"Wiki.NavBarController\">\n  <div class=\"wiki logbar-container\">\n    <ul class=\"nav nav-tabs\">\n      <li ng-show=\"branches.length || branch\" class=\"dropdown\">\n        <a href=\"#\" class=\"dropdown-toggle\" data-toggle=\"dropdown\"\n           title=\"The branch to view\">\n          {{branch || \'branch\'}}\n          <span class=\"caret\"></span>\n        </a>\n        <ul class=\"dropdown-menu\">\n          <li ng-repeat=\"otherBranch in branches\">\n            <a ng-href=\"{{branchLink(otherBranch)}}{{hash}}\"\n               ng-hide=\"otherBranch === branch\"\n               title=\"Switch to the {{otherBranch}} branch\"\n               data-placement=\"bottom\">\n              {{otherBranch}}</a>\n          </li>\n        </ul>\n      </li>\n      <li ng-repeat=\"link in breadcrumbs\">\n        <a ng-href=\"{{link.href}}{{hash}}\">{{link.name}}</a>\n      </li>\n      <li class=\"ng-scope active\">\n        <a>configuration</a>\n      </li>\n    </ul>\n  </div>\n</div>\n\n<div class=\"wiki-fixed\">\n  <div ng-include src=\"\'plugins/osgi/html/configurations.html\'\"></div>\n</div>\n");
$templateCache.put("plugins/wiki/html/create.html","<div class=\"row\" ng-controller=\"Wiki.CreateController\">\n  <div class=\"row\">\n    <div class=\"col-md-12\">\n      <form name=\"createForm\"\n            novalidate\n            class=\"form-horizontal no-bottom-margin\"\n            ng-submit=\"addAndCloseDialog(newDocumentName)\">\n        <fieldset>\n\n          <div class=\"row\">\n            <div class=\"col-md-12\">\n              <h4>Create Document</h4>\n            </div>\n          </div>\n\n          <div class=\"row\">\n            <div class=\"col-md-2\">\n            </div>\n            <div class=\"col-md-4\">\n              <div hawtio-tree=\"createDocumentTree\"\n                     hideRoot=\"true\"\n                     onSelect=\"onCreateDocumentSelect\"\n                     activateNodes=\"createDocumentTreeActivations\"></div>\n            </div>\n            <div class=\"col-md-4\">\n              <div class=\"row\">\n                <div class=\"well\">\n                  {{selectedCreateDocumentTemplate.tooltip}}\n                </div>\n              </div>\n              <div class=\"row\">\n                <div ng-show=\"fileExists.exists\" class=\"alert\">\n                  Please choose a different name as <b>{{fileExists.name}}</b> already exists\n                </div>\n                <div ng-show=\"fileExtensionInvalid\" class=\"alert\">\n                  {{fileExtensionInvalid}}\n                </div>\n                <div ng-show=\"!createForm.$valid\" class=\"alert\">\n                  {{selectedCreateDocumentTemplateInvalid}}\n                </div>\n                <div class=\"control-group\">\n                  <label class=\"control-label\" for=\"fileName\">Name: </label>\n                  <div class=\"controls\">\n                    <input name=\"fileName\" id=\"fileName\"\n                           class=\"input-xlarge\"\n                           type=\"text\"\n                           ng-pattern=\"selectedCreateDocumentTemplateRegex\"\n                           ng-model=\"newDocumentName\"\n                           placeholder=\"{{selectedCreateDocumentTemplate.exemplar}}\">\n                  </div>\n                </div>\n              </div>\n              <div class=\"row\">\n                <div simple-form data=\"formSchema\" entity=\"formData\" onSubmit=\"generate()\"></div>\n              </div>\n              <div class=\"row\">\n                <input class=\"btn btn-primary add pull-right\"\n                       type=\"submit\"\n                       ng-disabled=\"!selectedCreateDocumentTemplate.exemplar || !createForm.$valid\"\n                       value=\"Create\">\n                <span class=\"pull-right\">&nbsp;</span>\n                <button class=\"btn btn-warning cancel pull-right\" type=\"button\" ng-click=\"cancel()\">Cancel</button>\n              </div>\n            </div>\n            <div class=\"col-md-2\">\n            </div>\n          </div>\n        </fieldset>\n      </form>\n    </div>\n  </div>\n\n</div>\n");
$templateCache.put("plugins/wiki/html/createPage.html","<div ng-controller=\"Wiki.EditController\">\n  <div class=\"logbar\" ng-controller=\"Wiki.NavBarController\">\n\n    <div class=\"wiki logbar-container\">\n\n      <ul class=\"connected nav nav-tabs\">\n        <li ng-repeat=\"link in breadcrumbs\" ng-class=\'{active : isActive(link.href)}\'>\n          <a ng-href=\"{{link.href}}{{hash}}\">\n            {{link.name}}\n          </a>\n        </li>\n\n        <li class=\"pull-right\">\n\n          <a href=\"\" id=\"cancelButton\" ng-click=\"cancel()\"\n                  class=\"pull-right\"\n                  title=\"Discards any updates\">\n            <i class=\"fa fa-remove\"></i> Cancel\n          </a>\n        </li>\n\n        <li class=\"pull-right\">\n          <a href=\"\" id=\"saveButton\" ng-show=\"isValid()\" ng-click=\"create()\"\n                  class=\"pull-right\"\n                  title=\"Creates this page and saves it in the wiki\">\n            <i class=\"fa fa-file-alt\"></i> Create\n          </a>\n        </li>\n\n      </ul>\n    </div>\n  </div>\n\n  <div class=\"wiki-fixed form-horizontal\">\n    <div class=\"control-group\">\n      <input type=\"text\" ng-model=\"fileName\" placeholder=\"File name\" class=\"col-md-12\"/>\n    </div>\n    <div class=\"control-group\">\n      <div ng-include=\"sourceView\" class=\"editor-autoresize\"></div>\n    </div>\n  </div>\n</div>\n");
$templateCache.put("plugins/wiki/html/dozerMappings.html","<div class=\"wiki-fixed\" ng-controller=\"Wiki.DozerMappingsController\">\n  <div class=\"logbar\" ng-controller=\"Wiki.NavBarController\">\n    <div class=\"wiki logbar-container\">\n      <ul class=\"nav nav-tabs connected\">\n        <li ng-repeat=\"link in breadcrumbs\" ng-class=\'{active : isActive(link.href)}\'>\n          <a ng-href=\"{{link.href}}{{hash}}\">{{link.name}}</a>\n        </li>\n\n        <!--\n                <li class=\"pull-right\">\n                  <a ng-href=\"{{editLink()}}{{hash}}\" ng-hide=\"!editLink()\" title=\"Edit this camel configuration\"\n                     data-placement=\"bottom\">\n                    <i class=\"fa fa-edit\"></i> Edit</a></li>\n                <li class=\"pull-right\" ng-show=\"sourceLink()\">\n        -->\n        <li class=\"pull-right\">\n          <a href=\"\" id=\"saveButton\" ng-disabled=\"!isValid()\" ng-click=\"save()\"\n             ng-class=\"{\'nav-primary\' : modified}\"\n             title=\"Saves the Mappings document\">\n            <i class=\"fa fa-save\"></i> Save</a>\n        </li>\n        <li class=\"pull-right\">\n          <a href=\"\" id=\"cancelButton\" ng-click=\"cancel()\"\n             title=\"Discards any updates\">\n            <i class=\"fa fa-remove\"></i> Cancel</a>\n        </li>\n\n        <li class=\"pull-right\">\n          <a ng-href=\"{{sourceLink()}}\" title=\"View source code\"\n             data-placement=\"bottom\">\n            <i class=\"fa fa-file-alt\"></i> Source</a>\n        </li>\n      </ul>\n    </div>\n  </div>\n\n  <div class=\"tabbable hawtio-form-tabs\" ng-model=\"tab\" ng-hide=\"missingContainer\">\n\n    <div class=\"tab-pane\" title=\"Mappings\">\n\n      <div class=\"row\">\n        <div class=\"col-md-12 centered spacer\">\n          <select class=\"no-bottom-margin\" ng-model=\"selectedMapping\" ng-options=\"m.map_id for m in mappings\"></select>\n          <button class=\"btn\"\n                  ng-click=\"addMapping()\"\n                  title=\"Add mapping\">\n            <i class=\"fa fa-plus\"></i>\n          </button>\n          <button class=\"btn\"\n                  ng-click=\"deleteDialog = true\"\n                  title=\"Delete mapping\">\n            <i class=\"fa fa-minus\"></i>\n          </button>\n          &nbsp;\n          &nbsp;\n          <label class=\"inline-block\" for=\"map_id\">Map ID: </label>\n          <input id=\"map_id\" type=\"text\" class=\"input-xxlarge no-bottom-margin\" ng-model=\"selectedMapping.map_id\">\n        </div>\n      </div>\n\n      <div class=\"row\">\n        <!-- \"From\" class header -->\n        <div class=\"col-md-5\">\n          <div class=\"row\">\n            <input type=\"text\" class=\"col-md-12\"\n                   ng-model=\"aName\"\n                   typeahead=\"title for title in classNames($viewValue) | filter:$viewValue\"\n                   typeahead-editable=\"true\" title=\"Java classname for class \'A\'\"\n                   placeholder=\"Java classname for class \'A\'\">\n          </div>\n          <div class=\"row\" ng-show=\"selectedMapping.class_a.error\">\n            <div class=\"alert alert-error\">\n              <div class=\"expandable closed\">\n                <div class=\"title\">\n                  <i class=\"expandable-indicator\"></i> Failed to load properties for {{selectedMapping.class_a.value}} due to {{selectedMapping.class_a.error.type}}\n                </div>\n                <div class=\"expandable-body well\">\n                  <div ng-bind-html-unsafe=\"formatStackTrace(selectedMapping.class_a.error.stackTrace)\"></div>\n                </div>\n              </div>\n            </div>\n          </div>\n        </div>\n\n        <div class=\"col-md-2 centered\">\n          <button class=\"btn\" ng-click=\"doReload()\" ng-disabled=\"disableReload()\"><i class=\"fa fa-refresh\"></i> Reload</button>\n        </div>\n\n        <!-- \"To\" class header -->\n        <div class=\"col-md-5\">\n          <div class=\"row\">\n            <input type=\"text\" class=\"col-md-12\"\n                   ng-model=\"bName\"\n                   typeahead=\"title for title in classNames($viewValue) | filter:$viewValue\"\n                   typeahead-editable=\"true\" title=\"Java classname for class \'B\'\"\n                   placeholder=\"Java classname for class \'B\'\">\n          </div>\n          <div class=\"row\" ng-show=\"selectedMapping.class_b.error\">\n            <div class=\"alert alert-error\">\n              <div class=\"expandable closed\">\n                <div class=\"title\">\n                  <i class=\"expandable-indicator\"></i> Failed to load properties for {{selectedMapping.class_b.value}} due to {{selectedMapping.class_b.error.type}}\n                </div>\n                <div class=\"expandable-body well\">\n                  <div ng-bind-html-unsafe=\"formatStackTrace(selectedMapping.class_b.error.stackTrace)\"></div>\n                </div>\n              </div>\n            </div>\n          </div>\n        </div>\n\n      </div>\n\n      <script type=\"text/ng-template\" id=\"property.html\">\n        <span class=\"jsplumb-node dozer-mapping-node\"\n              id=\"{{field.id}}\"\n              anchors=\"{{field.anchor}}\"\n              field-path=\"{{field.path}}\">\n          <strong>{{field.displayName}}</strong> : <span class=\"typeName\">{{field.typeName}}</span>\n        </span>\n        <ul>\n          <li ng-repeat=\"field in field.properties\"\n              ng-include=\"\'property.html\'\"></li>\n        </ul>\n      </script>\n\n\n      <script type=\"text/ng-template\" id=\"pageTemplate.html\">\n        <div hawtio-jsplumb draggable=\"false\" layout=\"false\" timeout=\"500\">\n\n          <!-- \"from\" class -->\n          <div class=\"col-md-6\">\n            <div class=\"row\" ng-hide=\"selectedMapping.class_a.error\">\n              <ul class=\"dozer-mappings from\">\n                <li ng-repeat=\"field in selectedMapping.class_a.properties\"\n                    ng-include=\"\'property.html\'\"></li>\n              </ul>\n            </div>\n          </div>\n\n\n          <!-- \"to\" class -->\n          <div class=\"col-md-6\">\n            <div class=\"row\" ng-hide=\"selectedMapping.class_b.error\">\n              <ul class=\"dozer-mappings to\">\n                <li ng-repeat=\"field in selectedMapping.class_b.properties\"\n                    ng-include=\"\'property.html\'\"></li>\n              </ul>\n            </div>\n          </div>\n        </div>\n      </script>\n      <div class=\"row\" compile=\"main\"></div>\n\n    </div>\n\n    <div class=\"tab-pane\" title=\"Tree\">\n\n      <div class=\"row\">\n        <div class=\"col-md-12\">\n          <ul class=\"nav nav-pills\">\n            <li>\n              <a href=\'\' title=\"Add a new mapping between two classes\" ng-click=\"addMapping()\" data-placement=\"bottom\">\n                <i class=\"fa fa-plus\"></i> Class</a></li>\n            <li>\n              <a href=\'\' title=\"Add new mappings between fields in these classes\" ng-disable=\"!selectedMapping\" ng-click=\"addField()\" data-placement=\"bottom\">\n                <i class=\"fa fa-plus\"></i> Field</a></li>\n            <li>\n              <a href=\'\' title=\"Deletes the selected item\" ng-disabled=\"!canDelete()\" ng-click=\"deleteDialog = true\" data-placement=\"bottom\">\n                <i class=\"fa fa-remove\"></i> Delete</a></li>\n          </ul>\n        </div>\n      </div>\n\n      <div class=\"row\">\n        <div id=\"tree-container\" class=\"col-md-4\">\n          <div hawtio-tree=\"mappingTree\" onselect=\"onNodeSelect\" onDragEnter=\"onNodeDragEnter\" onDrop=\"onNodeDrop\"\n               onRoot=\"onRootTreeNode\"\n               hideRoot=\"true\"></div>\n        </div>\n\n        <div class=\"col-md-8\">\n          <div ng-include=\"propertiesTemplate\"></div>\n        </div>\n      </div>\n\n      <div hawtio-confirm-dialog=\"deleteDialog\"\n           ok-button-text=\"Delete\"\n           on-ok=\"removeNode()\">\n        <div class=\"dialog-body\">\n          <p>You are about to delete the selected {{selectedDescription}}\n          </p>\n          <p>This operation cannot be undone so please be careful.</p>\n        </div>\n      </div>\n\n      <div class=\"modal-large\">\n        <div modal=\"addDialog.show\" close=\"addDialog.close()\" ng-options=\"addDialog.options\">\n          <form class=\"form-horizontal no-bottom-margin\" ng-submit=\"addAndCloseDialog()\">\n            <div class=\"modal-header\"><h4>Add Fields</h4></div>\n            <div class=\"modal-body\">\n              <table class=\"\">\n                <tr>\n                  <th>From</th>\n                  <th></th>\n                  <th>To</th>\n                  <th>Exclude</th>\n                </tr>\n                <tr ng-repeat=\"unmapped in unmappedFields\">\n                  <td>\n                    {{unmapped.fromField}}\n                  </td>\n                  <td>-></td>\n                  <td>\n                    <input type=\"text\" ng-model=\"unmapped.toField\" ng-change=\"onUnmappedFieldChange(unmapped)\"\n                           typeahead=\"title for title in toFieldNames($viewValue) | filter:$viewValue\" typeahead-editable=\'true\'\n                           title=\"The field to map to\"/>\n                  </td>\n                  <td>\n                    <input type=\"checkbox\" ng-model=\"unmapped.exclude\" ng-click=\"onUnmappedFieldChange(unmapped)\"\n                           title=\"Whether or not the field should be excluded\"/>\n                  </td>\n                </tr>\n              </table>\n            </div>\n            <div class=\"modal-footer\">\n              <input id=\"submit\" class=\"btn btn-primary add\" type=\"submit\" ng-disabled=\"!unmappedFieldsHasValid\"\n                     value=\"Add\">\n              <button class=\"btn btn-warning cancel\" type=\"button\" ng-click=\"addDialog.close()\">Cancel</button>\n            </div>\n          </form>\n        </div>\n      </div>\n    </div>\n\n  </div>\n\n  <div class=\"jumbotron\" ng-show=\"missingContainer\">\n    <p>You cannot edit the dozer mapping file as there is no container running for the profile <b>{{profileId}}</b>.</p>\n\n    <p>\n      <a class=\"btn btn-primary btn-lg\"\n         href=\"#/fabric/containers/createContainer?profileIds={{profileId}}&versionId={{versionId}}\">\n        Create a container for: <strong>{{profileId}}</strong>\n      </a>\n    </p>\n  </div>\n</div>\n");
$templateCache.put("plugins/wiki/html/dozerPropertiesEdit.html","<div simple-form name=\"formEditor\" entity=\'dozerEntity\' data=\'nodeModel\' schema=\"schema\"></div>\n");
$templateCache.put("plugins/wiki/html/editPage.html","<div ng-controller=\"Wiki.EditController\">\n  <div class=\"logbar\" ng-controller=\"Wiki.NavBarController\">\n    <div class=\"wiki logbar-container\">\n      <ul class=\"nav nav-tabs\">\n        <li ng-repeat=\"link in breadcrumbs\" ng-class=\'{active : isActive(link.href)}\'>\n          <a ng-href=\"{{link.href}}{{hash}}\">{{link.name}}</a>\n        </li>\n\n        <li class=\"pull-right\">\n          <a id=\"saveButton\"\n             href=\"\"\n             ng-disabled=\"canSave()\"\n             ng-click=\"save()\"\n             title=\"Saves the updated wiki page\">\n            <i class=\"fa fa-save\"></i> Save</a>\n        </li>\n        <li class=\"pull-right\">\n          <a id=\"cancelButton\"\n             href=\"\"\n             ng-click=\"cancel()\"\n             title=\"Discards any updates\">\n            <i class=\"fa fa-remove\"></i> Cancel</a>\n        </li>\n      </ul>\n    </div>\n  </div>\n\n  <div class=\"wiki-fixed form-horizontal\">\n    <div class=\"control-group editor-autoresize\">\n      <div ng-include=\"sourceView\" class=\"editor-autoresize\"></div>\n    </div>\n  </div>\n</div>\n");
$templateCache.put("plugins/wiki/html/formEdit.html","<div simple-form name=\"formEditor\" entity=\'formEntity\' data=\'formDefinition\'></div>\n");
$templateCache.put("plugins/wiki/html/formTable.html","<div ng-controller=\"Wiki.FormTableController\">\n  <div class=\"logbar\" ng-controller=\"Wiki.NavBarController\">\n    <div class=\"wiki logbar-container\">\n      <ul class=\"nav nav-tabs\">\n        <li ng-repeat=\"link in breadcrumbs\" ng-class=\'{active : isActive(link.href)}\'>\n          <a ng-href=\"{{link.href}}{{hash}}\">{{link.name}}</a>\n        </li>\n\n        <li class=\"pull-right\">\n          <a ng-href=\"{{editLink()}}{{hash}}\" ng-hide=\"!editLink()\" title=\"Edit this page\"\n             data-placement=\"bottom\">\n            <i class=\"fa fa-edit\"></i> Edit</a></li>\n        <li class=\"pull-right\">\n          <a ng-href=\"{{historyLink}}{{hash}}\" ng-hide=\"!historyLink\" title=\"View the history of this file\"\n             data-placement=\"bottom\">\n            <i class=\"fa fa-comments-alt\"></i> History</a></li>\n        <li class=\"pull-right\">\n          <a ng-href=\"{{createLink()}}{{hash}}\" title=\"Create new page\"\n             data-placement=\"bottom\">\n            <i class=\"fa fa-plus\"></i> Create</a></li>\n        <li class=\"pull-right\" ng-show=\"sourceLink()\">\n          <a ng-href=\"{{sourceLink()}}\" title=\"View source code\"\n             data-placement=\"bottom\">\n            <i class=\"fa fa-file-alt\"></i> Source</a></li>\n      </ul>\n    </div>\n  </div>\n\n  <div class=\"wiki-fixed row\">\n    <input class=\"search-query col-md-12\" type=\"text\" ng-model=\"gridOptions.filterOptions.filterText\"\n           placeholder=\"Filter...\">\n  </div>\n\n  <div class=\"form-horizontal\">\n    <div class=\"row\">\n      <div ng-include=\"tableView\"></div>\n    </div>\n  </div>\n</div>\n");
$templateCache.put("plugins/wiki/html/formTableDatatable.html","<div class=\"gridStyle\" hawtio-datatable=\"gridOptions\"></div>\n");
$templateCache.put("plugins/wiki/html/formView.html","<div simple-form name=\"formViewer\" mode=\'view\' entity=\'formEntity\' data=\'formDefinition\'></div>\n");
$templateCache.put("plugins/wiki/html/gitPreferences.html","<div title=\"Git\" ng-controller=\"Wiki.GitPreferences\">\n  <div hawtio-form-2=\"config\" entity=\"entity\"></div>\n</div>\n");
$templateCache.put("plugins/wiki/html/history.html","<link rel=\"stylesheet\" href=\"plugins/wiki/css/wiki.css\" type=\"text/css\"/>\n\n<div ng-controller=\"Wiki.HistoryController\">\n  <script type=\"text/ng-template\" id=\"changeCellTemplate.html\">\n    <div class=\"ngCellText\">\n      <a class=\"commit-link\" ng-href=\"{{row.entity.commitLink}}{{hash}}\" title=\"{{row.entity.name}}\">{{row.entity.commitHashText}}\n        <i class=\"fa fa-circle-arrow-right\"></i></a>\n    </div>\n  </script>\n\n  <div ng-hide=\"inDashboard\" class=\"logbar\" ng-controller=\"Wiki.NavBarController\">\n    <div class=\"wiki logbar-container\">\n      <ul class=\"nav nav-tabs\">\n        <li ng-show=\"branches.length || branch\" class=\"dropdown\">\n          <a href=\"#\" class=\"dropdown-toggle\" data-toggle=\"dropdown\"\n             title=\"The branch to view\">\n            {{branch || \'branch\'}}\n            <span class=\"caret\"></span>\n          </a>\n          <ul class=\"dropdown-menu\">\n            <li ng-repeat=\"otherBranch in branches\">\n              <a ng-href=\"{{branchLink(otherBranch)}}{{hash}}\"\n                 ng-hide=\"otherBranch === branch\"\n                 title=\"Switch to the {{otherBranch}} branch\"\n                 data-placement=\"bottom\">\n                {{otherBranch}}</a>\n            </li>\n          </ul>\n        </li>\n        <li ng-repeat=\"link in breadcrumbs\">\n          <a ng-href=\"{{link.href}}{{hash}}\">{{link.name}}</a>\n        </li>\n        <li class=\"ng-scope active\">\n          <a>History</a>\n        </li>\n\n        <li class=\"pull-right\" hawtio-show object-name=\"{{gitMBean}}\" method-name=\"write\">\n          <a ng-href=\"{{editLink()}}{{hash}}\" ng-hide=\"!editLink()\" title=\"Edit this page\"\n             data-placement=\"bottom\">\n            <i class=\"fa fa-edit\"></i> Edit</a></li>\n        <li class=\"pull-right\">\n          <a ng-href=\"{{historyLink}}{{hash}}\" ng-hide=\"!historyLink\" title=\"View the history of this file\"\n             data-placement=\"bottom\">\n            <i class=\"fa fa-comments-alt\"></i> History</a></li>\n        <li class=\"pull-right\" hawtio-show object-name=\"{{gitMBean}}\" method-name=\"write\">\n          <a ng-href=\"{{createLink()}}{{hash}}\" title=\"Create new page\"\n             data-placement=\"bottom\">\n            <i class=\"fa fa-plus\"></i> Create</a></li>\n      </ul>\n    </div>\n  </div>\n\n  <div class=\"wiki-fixed row\">\n    <div class=\"col-md-4\">\n      <div class=\"control-group\">\n        <button class=\"btn\" ng-disabled=\"!selectedItems.length\" ng-click=\"diff()\"\n                title=\"Compare the selected versions of the files to see how they differ\"><i\n                class=\"fa fa-exchange\"></i>\n          Compare\n        </button>\n\n        <button class=\"btn\" ng-disabled=\"!canRevert()\" ng-click=\"revert()\"\n                title=\"Revert to this version of the file\" hawtio-show object-name=\"{{gitMBean}}\" method-name=\"revertTo\"><i class=\"fa fa-exchange\"></i> Revert\n        </button>\n      </div>\n    </div>\n    <div class=\"col-md-8\">\n      <div class=\"control-group\">\n        <input class=\"col-md-12 search-query\" type=\"text\" ng-model=\"gridOptions.filterOptions.filterText\"\n               placeholder=\"search\">\n      </div>\n    </div>\n  </div>\n\n  <div class=\"form-horizontal\">\n    <!--\n        <div class=\"row\">\n            <div class=\"gridStyle\" ng-grid=\"gridOptions\"></div>\n        </div>\n    </div>-->\n\n    <div class=\"row\">\n      <table class=\"table-condensed table-striped\" hawtio-simple-table=\"gridOptions\"></table>\n    </div>\n\n  </div>\n</div>\n");
$templateCache.put("plugins/wiki/html/layoutWiki.html","<div class=\"row\" ng-controller=\"Wiki.TopLevelController\">\n  <div ng-view></div>\n</div>\n\n");
$templateCache.put("plugins/wiki/html/sourceEdit.html","<textarea id=\"source\" ui-codemirror=\"codeMirrorOptions\" ng-model=\"entity.source\"></textarea>\n");
$templateCache.put("plugins/wiki/html/sourceView.html","<textarea id=\"source\" ui-codemirror=\"codeMirrorOptions\" ng-model=\"source\"></textarea>\n");
$templateCache.put("plugins/wiki/html/viewBook.html","<div ng-controller=\"Wiki.ViewController\">\n\n  <script type=\"text/ng-template\" id=\"fileCellTemplate.html\">\n    <div class=\"ngCellText\"\n         title=\"{{fileName(row.entity)}} - Last Modified: {{row.entity.lastModified | date:\'medium\'}}, Size: {{row.entity.length}}\">\n      <a href=\"{{childLink(row.entity)}}\" class=\"file-name\">\n        <span class=\"file-icon\"\n              ng-class=\"fileClass(row.entity)\"\n              ng-bind-html-unsafe=\"fileIconHtml(row)\">\n\n              </span>{{fileName(row.entity)}}\n      </a>\n    </div>\n  </script>\n\n  <script type=\"text/ng-template\" id=\"fileColumnTemplate.html\">\n\n    <div class=\"ngHeaderSortColumn {{col.headerClass}}\"\n         ng-style=\"{\'cursor\': col.cursor}\"\n         ng-class=\"{ \'ngSorted\': !noSortVisible }\">\n\n      <div class=\"ngHeaderText\" ng-hide=\"pageId === \'/\'\">\n        <a ng-href=\"{{parentLink()}}\"\n           class=\"wiki-file-list-up\"\n           title=\"Open the parent folder\">\n          <i class=\"fa fa-level-up\"></i> Up a directory\n        </a>\n      </div>\n    </div>\n\n  </script>\n\n  <ng-include src=\"\'plugins/wiki/html/viewNavBar.html\'\"></ng-include>\n\n  <div class=\"wiki-fixed form-horizontal\">\n    <div class=\"row\">\n      <div class=\"tocify\" wiki-href-adjuster>\n        <!-- TODO we maybe want a more flexible way to find the links to include than the current link-filter -->\n        <div hawtio-toc-display get-contents=\"getContents(filename, cb)\"\n             html=\"html\" link-filter=\"[file-extension]\">\n        </div>\n      </div>\n      <div class=\"toc-content\" id=\"toc-content\"></div>\n    </div>\n  </div>\n</div>\n");
$templateCache.put("plugins/wiki/html/viewNavBar.html","<div ng-hide=\"inDashboard\" class=\"logbar\" ng-controller=\"Wiki.NavBarController\">\n  <div class=\"wiki logbar-container\">\n    <ul class=\"nav nav-tabs\">\n      <li ng-show=\"branches.length || branch\">\n        <div hawtio-drop-down=\"branchMenuConfig\"></div>\n      </li>\n      <li ng-repeat=\"link in breadcrumbs\" ng-class=\'{active : isActive(link.href) && !objectId}\'>\n        <a class=\"breadcrumb-link\" ng-href=\"{{link.href}}\">\n          <span class=\"contained c-medium\">{{link.name}}</span>\n        </a>\n      </li>\n      <li ng-show=\"objectId\">\n        <a ng-href=\"{{historyLink}}{{hash}}\">History</a>\n      </li>\n      <li ng-show=\"objectId\" class=\"active\">\n        <a>{{objectId}}</a>\n      </li>\n\n      <li class=\"pull-right dropdown\">\n        <a href=\"\" class=\"dropdown-toggle\" data-toggle=\"dropdown\">\n          Actions <span class=\"caret\"></span>\n        </a>\n        <ul class=\"dropdown-menu\">\n          <li ng-show=\"sourceLink()\">\n            <a ng-href=\"{{sourceLink()}}\" title=\"View source code\"\n               data-placement=\"bottom\">\n              <i class=\"fa fa-file-alt\"></i> Source</a>\n          </li>\n          <li>\n            <a ng-href=\"{{historyLink}}{{hash}}\" ng-hide=\"!historyLink\" title=\"View the history of this file\"\n               data-placement=\"bottom\">\n              <i class=\"fa fa-comments-alt\"></i> History</a>\n          </li>\n          <!--\n          <li class=\"divider\">\n          </li>\n          -->\n          <li ng-hide=\"gridOptions.selectedItems.length !== 1\" hawtio-show object-name=\"{{gitMBean}}\" method-name=\"rename\">\n            <a ng-click=\"openRenameDialog()\"\n               title=\"Rename the selected document\"\n               data-placement=\"bottom\">\n              <i class=\"fa fa-adjust\"></i> Rename</a>\n          </li>\n          <li ng-hide=\"!gridOptions.selectedItems.length\" hawtio-show object-name=\"{{gitMBean}}\" method-name=\"rename\">\n            <a ng-click=\"openMoveDialog()\"\n               title=\"move the selected documents to a new folder\"\n               data-placement=\"bottom\">\n              <i class=\"fa fa-move\"></i> Move</a>\n          </li>\n          <!--\n          <li class=\"divider\">\n          </li>\n          -->\n          <li ng-hide=\"!gridOptions.selectedItems.length\" hawtio-show object-name=\"{{gitMBean}}\" method-name=\"remove\">\n            <a ng-click=\"openDeleteDialog()\"\n               title=\"Delete the selected document(s)\"\n               data-placement=\"bottom\">\n              <i class=\"fa fa-remove\"></i> Delete</a>\n          </li>\n          <li class=\"divider\" ng-show=\"childActions.length\">\n          </li>\n          <li ng-repeat=\"childAction in childActions\">\n            <a ng-click=\"childAction.doAction()\"\n               title=\"{{childAction.title}}\"\n               data-placement=\"bottom\">\n              <i class=\"{{childAction.icon}}\"></i> {{childAction.name}}</a>\n          </li>\n        </ul>\n      </li>\n      <li class=\"pull-right\" hawtio-show object-name=\"{{gitMBean}}\" method-name=\"write\">\n        <a ng-href=\"{{editLink()}}{{hash}}\" ng-hide=\"!editLink()\" title=\"Edit this page\"\n           data-placement=\"bottom\">\n          <i class=\"fa fa-edit\"></i> Edit</a>\n      </li>\n      <li class=\"pull-right\" hawtio-show object-name=\"{{gitMBean}}\" method-name=\"write\">\n        <a ng-href=\"{{createLink()}}{{hash}}\"\n           title=\"Create new page\"\n           data-placement=\"bottom\">\n          <i class=\"fa fa-plus\"></i> Create</a>\n      </li>\n      <li class=\"pull-right\">\n        <div class=\"btn-group\" \n             ng-hide=\"!children || profile\">\n          <a class=\"btn btn-sm\"\n             ng-disabled=\"mode == ViewMode.List\"\n             href=\"\" \n             ng-click=\"setViewMode(ViewMode.List)\">\n            <i class=\"fa fa-list\"></i></a>\n          <a class=\"btn btn-sm\" \n             ng-disabled=\"mode == ViewMode.Icon\"\n             href=\"\" \n             ng-click=\"setViewMode(ViewMode.Icon)\">\n            <i class=\"fa fa-th-large\"></i></a>\n        </div>\n      </li>\n      <li class=\"pull-right\">\n        <a href=\"\" ng-hide=\"children || profile\" title=\"Add to dashboard\" ng-href=\"{{createDashboardLink()}}\"\n           data-placement=\"bottom\">\n          <i class=\"fa fa-share\"></i>\n        </a>\n      </li>\n    </ul>\n  </div>\n</div>\n\n\n");
$templateCache.put("plugins/wiki/html/viewPage.html","<div ng-controller=\"Wiki.ViewController\">\n  <script type=\"text/ng-template\" id=\"fileCellTemplate.html\">\n    <div class=\"ngCellText\"\n         title=\"{{fileName(row.entity)}} - Last Modified: {{row.entity.lastModified | date:\'medium\'}}, Size: {{row.entity.length}}\">\n      <a href=\"{{childLink(row.entity)}}\" class=\"file-name\" hawtio-file-drop=\"{{row.entity.fileName}}\" download-url=\"{{row.entity.downloadURL}}\">\n        <span class=\"file-icon\"\n              ng-class=\"fileClass(row.entity)\"\n              compile=\"fileIconHtml(row)\">\n        </span>{{fileName(row.entity)}}\n      </a>\n    </div>\n  </script>\n\n  <script type=\"text/ng-template\" id=\"fileColumnTemplate.html\">\n    <div class=\"ngHeaderSortColumn {{col.headerClass}}\"\n         ng-style=\"{\'cursor\': col.cursor}\"\n         ng-class=\"{ \'ngSorted\': !noSortVisible }\">\n      <div class=\"ngHeaderText\" ng-hide=\"pageId === \'/\'\">\n        <a ng-href=\"{{parentLink()}}\"\n           class=\"wiki-file-list-up\"\n           title=\"Open the parent folder\">\n          <i class=\"fa fa-level-up\"></i> Up a directory\n        </a>\n      </div>\n    </div>\n  </script>\n\n  <script type=\"text/ng-template\" id=\"imageTemplate.html\">\n    <img src=\"{{imageURL}}\">\n  </script>\n\n  <ng-include src=\"\'plugins/wiki/html/viewNavBar.html\'\"></ng-include>\n\n  <!-- Icon View -->\n  <div ng-show=\"mode == ViewMode.Icon\" class=\"wiki-fixed\">\n    <div ng-hide=\"!showAppHeader\">\n      <div class=\"row\">\n        <div class=\"col-md-12\">\n          <div kubernetes-json=\"kubernetesJson\"></div>\n        </div>\n      </div>\n    </div>\n    <div ng-hide=\"!html\" wiki-href-adjuster wiki-title-linker>\n      <div class=\"row\" style=\"margin-left: 10px\">\n        <div class=\"col-md-12\">\n          <div compile=\"html\"></div>\n        </div>\n      </div>\n    </div>\n    <div class=\"row\" ng-show=\"html && children\">\n      <div class=\"col-md-12 wiki-icon-view-header\">\n        <h5>Directories and Files</h5>\n      </div>\n    </div>\n    <div class=\"row\" ng-hide=\"!directory\">\n      <div class=\"col-md-12\" ng-controller=\"Wiki.FileDropController\">\n        <div class=\"wiki-icon-view\" nv-file-drop nv-file-over uploader=\"uploader\" over-class=\"ready-drop\">\n          <div class=\"column-box mouse-pointer well\"\n               ng-repeat=\"child in children\" \n               ng-class=\"isInGroup(gridOptions.selectedItems, child, \'selected\', \'\')\"\n               ng-click=\"toggleSelectionFromGroup(gridOptions.selectedItems, child)\">\n            <div class=\"row\">\n              <div class=\"col-md-2\" hawtio-file-drop=\"{{child.fileName}}\" download-url=\"{{child.downloadURL}}\">\n                  <span class=\"app-logo\" ng-class=\"fileClass(child)\" compile=\"fileIconHtml(child)\"></span>\n              </div>\n              <div class=\"col-md-10\">\n                <h3>\n                  <a href=\"{{childLink(child)}}\">{{child.displayName || child.name}}</a>\n                </h3>\n              </div>\n            </div>\n            <div class=\"row\" ng-show=\"child.summary\">\n              <div class=\"col-md-12\">\n                <p compile=\"marked(child.summary)\"></p>\n              </div>\n            </div>\n          </div>\n        </div>\n      </div>\n    </div>\n  </div>\n  <!-- end Icon view -->\n\n  <!-- start List view -->\n  <div ng-show=\"mode == ViewMode.List\" class=\"wiki-fixed\">\n    <hawtio-pane position=\"left\" width=\"300\">\n      <div ng-controller=\"Wiki.FileDropController\">\n        <div class=\"wiki-list-view\" nv-file-drop nv-file-over uploader=\"uploader\" over-class=\"ready-drop\">\n          <div class=\"wiki-grid\" hawtio-list=\"gridOptions\"></div>\n        </div>\n      </div>\n    </hawtio-pane>\n    <div class=\"row\">\n      <div ng-class=\"col-md-12\">\n        <div ng-hide=\"!showProfileHeader\">\n          <div class=\"row\">\n            <div class=\"col-md-12\">\n              <div fabric-profile-details version-id=\"versionId\" profile-id=\"profileId\"></div>\n              <p></p>\n            </div>\n          </div>\n        </div>\n        <div ng-hide=\"!showAppHeader\">\n          <div class=\"row\">\n            <div class=\"col-md-12\">\n              <div kubernetes-json=\"kubernetesJson\" children=\"children\"></div>\n            </div>\n          </div>\n        </div>\n        <div ng-hide=\"!html\" wiki-href-adjuster wiki-title-linker>\n          <div class=\"row\" style=\"margin-left: 10px\">\n            <div class=\"col-md-12\">\n              <div compile=\"html\"></div>\n            </div>\n          </div>\n        </div>\n      </div>\n    </div>\n  </div>\n  <!-- end List view -->\n  <div ng-include=\"sourceView\" class=\"editor-autoresize\"></div>\n</div>\n");
$templateCache.put("plugins/wiki/html/modal/deleteDialog.html","<div>\n  <form class=\"form-horizontal\" ng-submit=\"deleteAndCloseDialog()\">\n    <div class=\"modal-header\"><h4>Delete Document</h4></div>\n    <div class=\"modal-body\">\n      <div class=\"control-group\">\n        <p>You are about to delete\n          <ng-pluralize count=\"gridOptions.selectedItems.length\"\n                        when=\"{\'1\': \'this document!\', \'other\': \'these {} documents!\'}\">\n          </ng-pluralize>\n        </p>\n\n        <div ng-bind-html-unsafe=\"selectedFileHtml\"></div>\n        <p class=\"alert alert-danger\" ng-show=\"warning\" ng-bind-html-unsafe=\"warning\">\n        </p>\n      </div>\n    </div>\n    <div class=\"modal-footer\">\n      <input class=\"btn btn-primary\" type=\"submit\"\n             value=\"Delete\">\n      <button class=\"btn btn-warning cancel\" type=\"button\" ng-click=\"close()\">Cancel</button>\n    </div>\n  </form>\n</div>\n");
$templateCache.put("plugins/wiki/html/modal/moveDialog.html","<div>\n    <form class=\"form-horizontal\" ng-submit=\"moveAndCloseDialog()\">\n    <div class=\"modal-header\"><h4>Move Document</h4></div>\n    <div class=\"modal-body\">\n      <div class=\"control-group\">\n        <label class=\"control-label\" for=\"moveFolder\">Folder</label>\n\n        <div class=\"controls\">\n          <input type=\"text\" id=\"moveFolder\" ng-model=\"move.moveFolder\"\n                 typeahead=\"title for title in folderNames($viewValue) | filter:$viewValue\" typeahead-editable=\'true\'>\n        </div>\n      </div>\n    </div>\n    <div class=\"modal-footer\">\n      <input class=\"btn btn-primary\" type=\"submit\"\n             ng-disabled=\"!move.moveFolder\"\n             value=\"Move\">\n      <button class=\"btn btn-warning cancel\" type=\"button\" ng-click=\"close()\">Cancel</button>\n    </div>\n  </form>\n</div>");
$templateCache.put("plugins/wiki/html/modal/renameDialog.html","<div>\n  <form class=\"form-horizontal\" ng-submit=\"renameAndCloseDialog()\">\n    <div class=\"modal-header\"><h4>Rename Document</h4></div>\n    <div class=\"modal-body\">\n      <div class=\"control-group\">\n        <label class=\"control-label\" for=\"renameFileName\">Name</label>\n\n        <div class=\"controls\">\n          <input type=\"text\" id=\"renameFileName\" ng-model=\"rename.newFileName\">\n        </div>\n      </div>\n\n      <div class=\"control-group\">\n        <div ng-show=\"fileExists.exists\" class=\"alert\">\n          Please choose a different name as <b>{{fileExists.name}}</b> already exists\n        </div>\n      </div>\n    </div>\n    <div class=\"modal-footer\">\n      <input class=\"btn btn-primary\" type=\"submit\"\n             ng-disabled=\"!fileName || fileExists.exists\"\n             value=\"Rename\">\n      <button class=\"btn btn-warning cancel\" type=\"button\" ng-click=\"close()\">Cancel</button>\n    </div>\n  </form>\n</div>\n");}]); hawtioPluginLoader.addModule("hawtio-wiki-templates");