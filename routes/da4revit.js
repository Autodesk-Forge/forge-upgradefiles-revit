/////////////////////////////////////////////////////////////////////
// Copyright (c) Autodesk, Inc. All rights reserved
// Written by Forge Partner Development
//
// Permission to use, copy, modify, and distribute this software in
// object code form for any purpose and without fee is hereby granted,
// provided that the above copyright notice appears in all copies and
// that both that copyright notice and the limited warranty and
// restricted rights notice below appear in all supporting
// documentation.
//
// AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
// AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
// MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
// DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
// UNINTERRUPTED OR ERROR FREE.
/////////////////////////////////////////////////////////////////////

const express = require('express');
const {
    ProjectsApi, 
    ItemsApi,
    VersionsApi,
    StorageRelationshipsTarget,
    CreateStorageDataRelationships,
    CreateStorageDataAttributes,
    CreateStorageData,
    CreateStorage,
    CreateVersion,
    CreateVersionData,
    CreateVersionDataRelationships,
    CreateItemRelationshipsStorageData,
    CreateItemRelationshipsStorage,
    CreateVersionDataRelationshipsItem,
    CreateVersionDataRelationshipsItemData,

    CreateItemDataRelationshipsTipData,
    CreateItemDataRelationshipsTip,
    StorageRelationshipsTargetData,
    CreateStorageDataRelationshipsTarget,
    CreateItemDataRelationships,
    BaseAttributesExtensionObject,
    CreateItemData,
    CreateItemRelationships,
    CreateItemIncluded,
    CreateItem
} = require('forge-apis');

const { OAuth } = require('./common/oauth');

const request = require("request");

// TBD: Change to your callback.
const callbackUrl = 'http://0b30ebac.ngrok.io/api/forge/da4revit/callback';
const hubBucketKey = 'wip.dm.prod';

const SOCKET_TOPIC_WORKITEM = 'Workitem-Notification';

let router = express.Router();

var workitemList = [];


// Middleware for obtaining a token for each request.
router.use(async (req, res, next) => {
    // // Get the access token
    // const oauth = new OAuth(req.session);
    // const oauth_client = oauth.get2LeggedClient();;
    // const credentials = await oauth_client.authenticate();

    // req.oauth_token = credentials;
    // req.oauth_client = oauth_client;
    // next();



    // Get the access token
    const oauth = new OAuth(req.session);
    let credentials = await oauth.getInternalToken();
    let oauth_client = oauth.getClient();

    req.oauth_client = oauth_client;
    req.oauth_token = credentials;


    // TBD: Keep 2 legged token for Design Automation API usage, will remove this when got 3 Legged working
    oauth_client = oauth.get2LeggedClient();;
    oauth_token = await oauth_client.authenticate();

    req.oauth_client_2Legged = oauth_client;
    req.oauth_token_2Legged = oauth_token;

    next();

});


router.post('/da4revit/workitem/cancel', async(req, res, next) =>{

    const workitemId = decodeURIComponent(req.body.workitemId);
    try {
        let workitemRes = await cancelWrokitem(workitemId, req.oauth_token_2Legged.access_token);
        let workitemStatus = {
            'WorkitemId': workitemId,
            'Status': "Cancelled"
        };
        global.socketio.emit(SOCKET_TOPIC_WORKITEM, workitemStatus);
        res.status(200).end(JSON.stringify(workitemRes.body));
    } catch (err) {
        res.status(500).end("error");
    }
})

router.post('/da4revit/workitem/query', async(req, res, next) => {
    const workitemId = decodeURIComponent(req.body.workitemId);
    try {
        let workitemRes = await getWorkitemStatus(workitemId, req.oauth_token_2Legged.access_token);
        res.status(200).end(JSON.stringify(workitemRes.body));
    } catch (err) {
        res.status(500).end("error");
    }
})

function getWorkitemStatus(workItemId, access_token) {

    return new Promise(function (resolve, reject) {

        var request = require("request");

        var options = {
            method: 'GET',
            url: 'https://developer.api.autodesk.com/da/us-east/v3/workitems/' + workItemId,
            headers: {
                Authorization: 'Bearer ' + access_token,
                'Content-Type': 'application/json'
            }
        };

        request(options, function (error, response, body) {
            if (error) {
                reject(err);
            } else {
                let resp;
                try {
                    resp = JSON.parse(body)
                } catch (e) {
                    resp = body
                }
                if (response.statusCode >= 400) {
                    console.log('error code: ' + response.statusCode + ' response message: ' + response.statusMessage);
                    reject({
                        statusCode: response.statusCode,
                        statusMessage: response.statusMessage
                    });
                } else {
                    resolve({
                        statusCode: response.statusCode,
                        headers: response.headers,
                        body: resp
                    });
                }
            }
        });
    });
}


function cancelWrokitem(workItemId, access_token) {

    return new Promise(function (resolve, reject) {

        var request = require("request");

        var options = {
            method: 'DELETE',
            url: 'https://developer.api.autodesk.com/da/us-east/v3/workitems/' + workItemId,
            headers: {
                Authorization: 'Bearer ' + access_token,
                'Content-Type': 'application/json'
            }
        };

        request(options, function (error, response, body) {
            if (error) {
                reject(err);
            } else {
                let resp;
                try {
                    resp = JSON.parse(body)
                } catch (e) {
                    resp = body
                }
                if (response.statusCode >= 400) {
                    console.log('error code: ' + response.statusCode + ' response message: ' + response.statusMessage);
                    reject({
                        statusCode: response.statusCode,
                        statusMessage: response.statusMessage
                    });
                } else {
                    resolve({
                        statusCode: response.statusCode,
                        headers: response.headers,
                        body: resp
                    });
                }
            }
        });
    });
}


router.post('/da4revit/upgradeToFolder', async (req, res, next) => {
    const sourceFileUrl = decodeURIComponent(req.body.sourceFile);
    const destinateFolderUrl = decodeURIComponent(req.body.destinateFolder);
    if (sourceFileUrl == '' || destinateFolderUrl == '') {
        res.status(400).end();
        return;
    }
    const sourceFileParams = sourceFileUrl.split('/');
    const destinateFolderParams = destinateFolderUrl.split('/');
    if (sourceFileParams.length < 3 || destinateFolderParams.length < 3) {
        console.log('info: the url format is not correct');
        res.status(400).end('the url format is not correct');
        return;
    }

    const sourceFileType = sourceFileParams[sourceFileParams.length - 2];
    const destinateFolderType = destinateFolderParams[destinateFolderParams.length - 2];
    if (sourceFileType != 'items' || destinateFolderType != 'folders') {
        console.log('info: not supported item');
        res.status(400).end('not supported item');
        return;
    }

    const sourceFileId = sourceFileParams[sourceFileParams.length - 1];
    const sourceProjectId = sourceFileParams[sourceFileParams.length - 3];

    const destinateFolderId = destinateFolderParams[destinateFolderParams.length - 1];
    const destinateProjectId = destinateFolderParams[destinateFolderParams.length - 3];

    try {
        ////////////////////////////////////////////////////////////////////////////////
        // get the storage of the input item version
        const versionInfo = await getLatestVersionInfo(sourceProjectId, sourceFileId, req.oauth_client, req.oauth_token);
        if (versionInfo == null) {
            console.log('error: failed to get lastest version of the file');
            res.status(500).end('failed to get lastest version of the file');
            return;
        }
        const inputUrl = versionInfo.versionUrl;
        console.log('input url for DA4Revit: ' + inputUrl);

        const items = new ItemsApi();
        const sourceFile = await items.getItem(sourceProjectId, sourceFileId, req.oauth_client, req.oauth_token);
        if (sourceFile == null || sourceFile.statusCode != 200) {
            console.log('error: failed to get the current file item.');
            res.status(500).end('failed to get the current file item');
            return;
        }
        const fileName = sourceFile.body.data.attributes.displayName;
        const itemType = sourceFile.body.data.attributes.extension.type;

        const fileParams = fileName.split('.');
        const fileExtension = fileParams[fileParams.length-1].toLowerCase();
        if( fileExtension != 'rvt' && fileExtension != 'rfa' && fileExtension != 'fte'){
            console.log('info: the file format is not supported');
            res.status(500).end('the file format is not supported');
            return;
        }
    
        ////////////////////////////////////////////////////////////////////////////////
        // create a new storage for the ouput item version
        const storageInfo = await getNewCreatedStorageInfo(destinateProjectId, destinateFolderId, fileName, req.oauth_client, req.oauth_token);
        if (storageInfo == null) {
            console.log('error: failed to create the storage');
            res.status(500).end('failed to create the storage');
            return;
        }
        const outputUrl = storageInfo.StorageUrl;
        console.log('output url for DA4Revit: ' + outputUrl);

        const createFirstVersionBody = createBodyOfPostItem(fileName, destinateFolderId, storageInfo.StorageId, itemType, versionInfo.versionType)
        if (createFirstVersionBody == null) {
            console.log('failed to create body of Post Item');
            res.status(500).end('failed to create body of Post Item');
            return;
        }

        
        ////////////////////////////////////////////////////////////////////////////////
        // use 2 legged token for design automation
        let upgradeRes = await upgradeFile(inputUrl, outputUrl, destinateProjectId, createFirstVersionBody,fileExtension, req.oauth_token, req.oauth_token_2Legged);
        if (upgradeRes == null || upgradeRes.statusCode != 200) {
            console.log('failed to upgrade the revit file');
            res.status(500).end('failed to upgrade the revit file');
            return;
        }
        const upgradeInfo = {
            "fileName": fileName,
            "workItemId": upgradeRes.body.id,
            "workItemStatus": upgradeRes.body.status
        };
        res.status(200).end(JSON.stringify(upgradeInfo));

    } catch (err) {
        console.log('get exception while upgrading the file')
        res.status(500).end(err);
    }
});

var getLatestVersionInfo = async function( projectId, fileId, oauth_client, oauth_token) {
    if( projectId == '' || fileId == ''){
        console.log('failed to get lastest version of the file');
        return null;
    }

    // get the storage of the input item version
    const versionItem = await getLatestVersion(projectId, fileId, oauth_client, oauth_token);
    if (versionItem == null) {
        console.log('failed to get lastest version of the file');
        return null;
    }
    return {
         "versionUrl":versionItem.relationships.storage.meta.link.href, 
         "versionType": versionItem.attributes.extension.type
        };
}

var createBodyOfPostStorage = function (folderId, fileName) {
    // create a new storage for the ouput item version
    let createStorage = new CreateStorage();
    let storageRelationshipsTargetData = new StorageRelationshipsTargetData("folders", folderId);
    let storageRelationshipsTarget = new StorageRelationshipsTarget;
    let createStorageDataRelationships = new CreateStorageDataRelationships();
    let createStorageData = new CreateStorageData();
    let createStorageDataAttributes = new CreateStorageDataAttributes();

    createStorageDataAttributes.name = fileName;
    storageRelationshipsTarget.data = storageRelationshipsTargetData;
    createStorageDataRelationships.target = storageRelationshipsTarget;
    createStorageData.relationships = createStorageDataRelationships;
    createStorageData.type = 'objects';
    createStorageData.attributes = createStorageDataAttributes;
    createStorage.data = createStorageData;
    
    return createStorage;
}

var createBodyOfPostVersion = function (fileId, fileName, storageId, versionType) {

    let createVersionDataRelationshipsItem = new CreateVersionDataRelationshipsItem();
    let createVersionDataRelationshipsItemData = new CreateVersionDataRelationshipsItemData();
    createVersionDataRelationshipsItemData.type = "items";
    createVersionDataRelationshipsItemData.id = fileId;
    createVersionDataRelationshipsItem.data = createVersionDataRelationshipsItemData;

    let createItemRelationshipsStorage = new CreateItemRelationshipsStorage();
    let createItemRelationshipsStorageData = new CreateItemRelationshipsStorageData();
    createItemRelationshipsStorageData.type = "objects";
    createItemRelationshipsStorageData.id = storageId;
    createItemRelationshipsStorage.data = createItemRelationshipsStorageData;

    let createVersionDataRelationships = new CreateVersionDataRelationships();
    createVersionDataRelationships.item = createVersionDataRelationshipsItem;
    createVersionDataRelationships.storage = createItemRelationshipsStorage;

    let baseAttributesExtensionObject = new BaseAttributesExtensionObject();
    baseAttributesExtensionObject.type = versionType;
    baseAttributesExtensionObject.version = "1.0";

    let createStorageDataAttributes = new CreateStorageDataAttributes();
    createStorageDataAttributes.name = fileName;
    createStorageDataAttributes.extension = baseAttributesExtensionObject;

    let createVersionData = new CreateVersionData();
    createVersionData.type = "versions";
    createVersionData.attributes = createStorageDataAttributes;
    createVersionData.relationships = createVersionDataRelationships;

    let createVersion = new CreateVersion();
    createVersion.data = createVersionData;

    return createVersion;
}

var createBodyOfPostItem = function( fileName, folderId, storageId, itemType, versionType){
    const body = 
    {
        "jsonapi":{
            "version":"1.0"
        },
        "data":{
            "type":"items",
            "attributes":{
                "name":fileName,
                "extension":{
                    "type":itemType,
                    "version":"1.0"
                }
            },
            "relationships":{
                "tip":{
                    "data":{
                        "type":"versions",
                        "id":"1"
                    }
                },
                "parent":{
                    "data":{
                        "type":"folders",
                        "id":folderId
                    }
                }
            }
        },
        "included":[
            {
                "type":"versions",
                "id":"1",
                "attributes":{
                    "name":fileName,
                    "extension":{
                        "type":versionType,
                        "version":"1.0"
                    }
                },
                "relationships":{
                    "storage":{
                        "data":{
                            "type":"objects",
                            "id":storageId
                        }
                    }
                }
            }
        ]
    };
    return body;
}

var getNewCreatedStorageInfo = async function (projectId, folderId, fileName, oauth_client, oauth_token) {

    // create body for Post Storage request
    let createStorageBody = createBodyOfPostStorage(folderId, fileName);

    const project = new ProjectsApi();
    let storage = await project.postStorage(projectId, createStorageBody, oauth_client, oauth_token);
    if (storage == null || storage.statusCode != 201) {
        console.log('failed to create a storage.');
        return null;
    }

    // setup the url of the new storage
    const strList = storage.body.data.id.split('/');
    if (strList.length != 2) {
        console.log('storage id is not correct');
        return null;
    }
    const storageUrl = "https://developer.api.autodesk.com/oss/v2/buckets/" + hubBucketKey + "/objects/" + strList[1];
    return {
        "StorageId": storage.body.data.id,
        "StorageUrl": storageUrl
    };
}

// upgrade revit file to specified version using Design Automation for Revit API
router.post('/da4revit/upgrade', async (req, res, next) => {
    // Only support upgrade singe Revit file for now
    const href = decodeURIComponent(req.body.id);
    if (href === '') {
        res.status(500).end();
        return;
    }

    if (href === '#') {
        res.status(500).end('not supported item');
    } 

    const params = href.split('/');
    if( params.length < 3){
        res.status(500).end('selected item id has problem');
    }

    const resourceName = params[params.length - 2];
    if (resourceName != 'items') {
        res.status(500).end('not supported item');
        return;
    }

    const resourceId = params[params.length - 1];
    const projectId = params[params.length - 3];

    try {
        const items = new ItemsApi();
        const folder = await items.getItemParentFolder(projectId, resourceId, req.oauth_client, req.oauth_token);
        if(folder == null || folder.statusCode != 200){
            console.log('failed to get the parent folder.');
            res.status(500).end('ailed to get the parent folder');
            return;
        }
        const item = await items.getItem(projectId, resourceId, req.oauth_client, req.oauth_token);
        if(item == null || item.statusCode != 200){
            console.log('failed to get the current file item.');
            res.status(500).end('failed to get the current file item');
            return;
        }
        const fileName = item.body.data.attributes.displayName;

        const fileParams = fileName.split('.');
        const fileExtension = fileParams[fileParams.length-1].toLowerCase();
        if( fileExtension != 'rvt' && fileExtension != 'rfa' && fileExtension != 'fte'){
            console.log('info: the file format is not supported');
            res.status(500).end('the file format is not supported');
            return;
        }

        const storageInfo = await getNewCreatedStorageInfo(projectId,folder.body.data.id, fileName, req.oauth_client, req.oauth_token);
        if (storageInfo == null ) {
            console.log('failed to create the storage');
            res.status(500).end('failed to create the storage');
            return;
        }
        const outputUrl = storageInfo.StorageUrl;
        console.log('output url for DA4Revit: ' + outputUrl);


        // get the storage of the input item version
        const versionInfo = await getLatestVersionInfo(projectId, resourceId, req.oauth_client, req.oauth_token);
        if (versionInfo == null ) {
            console.log('failed to get lastest version of the file');
            res.status(500).end('failed to get lastest version of the file');
            return;
        }
        const inputUrl = versionInfo.versionUrl;
        console.log('input url for DA4Revit: ' + inputUrl);

        const createVersionBody = createBodyOfPostVersion(resourceId,fileName, storageInfo.StorageId, versionInfo.versionType);
        if (createVersionBody == null ) {
            console.log('failed to create body of Post Version');
            res.status(500).end('failed to create body of Post Version');
            return;
        }


        ////////////////////////////////////////////////////////////////////////////////
        // use 2 legged token for design automation
        let upgradeRes = await upgradeFile(inputUrl, outputUrl, projectId, createVersionBody, fileExtension, req.oauth_token, req.oauth_token_2Legged );
        if(upgradeRes == null || upgradeRes.statusCode != 200 ){
            console.log('failed to upgrade the revit file');
            res.status(500).end('failed to upgrade the revit file');
            return;
        }
        const upgradeInfo = {
            "fileName": fileName,
            "workItemId": upgradeRes.body.id,
            "workItemStatus": upgradeRes.body.status
        };
        res.status(200).end(JSON.stringify(upgradeInfo));

    } catch (err) {
        console.log('get exception while upgrading the file')
        res.status(500).end(err);
    }
});


var getLatestVersion = async function (projectId, itemId, oauthClient, credentials) {
    const items = new ItemsApi();
    const versions = await items.getItemVersions(projectId, itemId, {}, oauthClient, credentials);
    if(versions == null || versions.statusCode != 200 ){
        console.log('failed to get the versions of file');
        res.status(500).end('failed to get the versions of file');
        return null;
    }
    return versions.body.data[0];
}


var upgradeFile = function (inputUrl, outputUrl, projectId, createVersionData, fileExtension, access_token_3Legged, access_token_2Legged) {

    return new Promise(function (resolve, reject) {

        const workitemBody = createPostWorkitemBody(inputUrl, outputUrl, fileExtension, access_token_3Legged.access_token);
        if( workitemBody == null){
            reject('workitem request body is null');
        }
    
        var options = {
            method: 'POST',
            url: 'https://developer.api.autodesk.com/da/us-east/v3/workitems',
            headers: {
                Authorization: 'Bearer ' + access_token_2Legged.access_token,
                'Content-Type': 'application/json'
            },
            body: workitemBody,
            json: true
        };

        request(options, function (error, response, body) {
            if (error) {
                reject(error);
            } else {
                let resp;
                try {
                    resp = JSON.parse(body)
                } catch (e) {
                    resp = body
                }
                const workitemId = resp.id;
                console.log(workitemId);

                workitemList.push({
                    workitemId: workitemId,
                    projectId: projectId,
                    createVersionData: createVersionData,
                    access_token_3Legged: access_token_3Legged
                })

                if (response.statusCode >= 400) {
                    console.log('error code: ' + response.statusCode + ' response message: ' + response.statusMessage);
                    reject({
                        statusCode: response.statusCode,
                        statusMessage: response.statusMessage
                    });
                } else {
                    resolve({
                        statusCode: response.statusCode,
                        headers: response.headers,
                        body: resp
                    });
                }
            }
        });
    })
}

var createPostWorkitemBody = function(inputUrl, outputUrl, fileExtension, access_token) {

    let body = null;
    switch (fileExtension) {
        case 'rvt':
            body = {
                activityId: 'revitiosample.FileUpgraderActivity+test',
                arguments: {
                    rvtFile: {
                        url: inputUrl,
                        Headers: {
                            Authorization: 'Bearer ' + access_token
                        },
                    },
                    resultrvt: {
                        verb: 'put',
                        url: outputUrl,
                        Headers: {
                            Authorization: 'Bearer ' + access_token
                        },
                    },
                    onComplete: {
                        verb: "post",
                        url: callbackUrl
                    }
                }
            };
            break;
        case 'rfa':
            body = {
                activityId: 'revitiosample.FileUpgraderActivity+test',
                arguments: {
                    rvtFile: {
                        url: inputUrl,
                        Headers: {
                            Authorization: 'Bearer ' + access_token
                        },
                    },
                    resultrfa: {
                        verb: 'put',
                        url: outputUrl,
                        Headers: {
                            Authorization: 'Bearer ' + access_token
                        },
                    },
                    onComplete: {
                        verb: "post",
                        url: callbackUrl
                    }
                }
            };
            break;
        case 'rte':
            body = {
                activityId: 'revitiosample.FileUpgraderActivity+test',
                arguments: {
                    rvtFile: {
                        url: inputUrl,
                        Headers: {
                            Authorization: 'Bearer ' + access_token
                        },
                    },
                    resultrte: {
                        verb: 'put',
                        url: outputUrl,
                        Headers: {
                            Authorization: 'Bearer ' + access_token
                        },
                    },
                    onComplete: {
                        verb: "post",
                        url: callbackUrl
                    }
                }
            };
            break;

    }
    return body;
}

router.post('/da4revit/callback', async (req, res, next) => {
    let workitemStatus = {
        'WorkitemId': req.body.id,
        'Status': "Success"
    };
    if (req.body.status == 'success') {
        workitemStatus.Status = 'Success';
        global.socketio.emit(SOCKET_TOPIC_WORKITEM, workitemStatus);
        // TBD, empty the list if length > 100 to save the memory.
        workitemList.forEach(async (workitem, index) => {
            if (workitem.workitemId == req.body.id) {
                try {
                    console.log("check the workitem");
                    console.log(workitem);
                    
                    const type = workitem.createVersionData.data.type;
                    let version = null;
                    if(type == "versions"){
                        const versions = new VersionsApi();
                        version = await versions.postVersion(workitem.projectId, workitem.createVersionData, req.oauth_client, workitem.access_token_3Legged);
                    }else{
                        const items = new ItemsApi();
                        version = await items.postItem(workitem.projectId, workitem.createVersionData, req.oauth_client, workitem.access_token_3Legged);
                    }
                    if( version == null || version.statusCode != 201 ){ 
                        console.log('falied to create a new version of the file');
                        global.socketio.emit(SOCKET_TOPIC_WORKITEM, workitemStatus);
                        return;
                    }
                    workitemStatus.Status = 'Completed';
                    global.socketio.emit(SOCKET_TOPIC_WORKITEM, workitemStatus);

                    console.log('successfully created a new version of the file');
                    return;
                } catch (err) {
                    console.log(err);
                    workitemStatus.Status = 'Failed';
                    global.socketio.emit(SOCKET_TOPIC_WORKITEM, workitemStatus);
                    return;
                }
            }
        });
    }else{
        // Report if not successful.
        workitemStatus.Status = 'Failed';
        global.socketio.emit(SOCKET_TOPIC_WORKITEM, workitemStatus);
        console.log(req.body);
    }
    return;
})



module.exports = router;
