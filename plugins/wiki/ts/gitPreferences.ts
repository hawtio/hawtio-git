/// <reference path="../../includes.ts"/>
/// <reference path="wikiHelpers.ts"/>

/**
 * @module Wiki
 */
 module Wiki {
  _module.controller("Wiki.GitPreferences", ["$scope", "localStorage", "userDetails", ($scope, localStorage, userDetails) => {
    Core.initPreferenceScope($scope, localStorage, {
      'gitUserName': {
        'value': userDetails.username
      },
      'gitUserEmail': {
        'value': ''
      }  
    });
  }]);
 }
