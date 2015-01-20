/// <reference path="../../includes.d.ts" />
/// <reference path="wikiHelpers.d.ts" />
/// <reference path="wikiPlugin.d.ts" />
declare module Wiki {
    interface WikiDialog {
        open: () => {};
        close: () => {};
    }
    interface RenameDialogOptions {
        rename: () => {};
        fileExists: () => {};
        fileName: () => String;
        callbacks: () => String;
    }
    function getRenameDialog($dialog: any, $scope: RenameDialogOptions): WikiDialog;
    interface MoveDialogOptions {
        move: () => {};
        folderNames: () => {};
        callbacks: () => String;
    }
    function getMoveDialog($dialog: any, $scope: MoveDialogOptions): WikiDialog;
    interface DeleteDialogOptions {
        callbacks: () => String;
        selectedFileHtml: () => String;
        warning: () => string;
    }
    function getDeleteDialog($dialog: any, $scope: DeleteDialogOptions): WikiDialog;
}
