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
    ItemsApi,
    VersionsApi,
} = require('forge-apis');

const { OAuth } = require('./common/oauthImp');

const { 
    getWorkitemStatus, 
    cancelWrokitem,
    upgradeFile, 
    getLatestVersionInfo, 
    getNewCreatedStorageInfo, 
    createBodyOfPostVersion,
    createBodyOfPostItem,
    workitemList 
} = require('./common/da4revitImp')

const SOCKET_TOPIC_WORKITEM = 'Workitem-Notification';

let router = express.Router();


///////////////////////////////////////////////////////////////////////
/// Middleware for obtaining a token for each request.
///////////////////////////////////////////////////////////////////////
router.use(async (req, res, next) => {
    const oauth = new OAuth(req.session);
    let credentials = await oauth.getInternalToken();
    let oauth_client = oauth.getClient();

    req.oauth_client = oauth_client;
    req.oauth_token = credentials;
    next();
});



///////////////////////////////////////////////////////////////////////
/// upgrade revit file to specified version using Design Automation 
/// for Revit API
///////////////////////////////////////////////////////////////////////
router.post('/da4revit/v1/upgrader/files', async (req, res, next) => {
    const fileItemId   = req.body.fileItemId;
    const fileItemName = req.body.fileItemName;

    if (fileItemId === '' || fileItemName === '') {
        res.status(500).end();
        return;
    }

    if (fileItemId === '#') {
        res.status(500).end('not supported item');
    } 

    const params = fileItemId.split('/');
    if( params.length < 3){
        res.status(500).end('selected item id has problem');
    }

    const resourceName = params[params.length - 2];
    if (resourceName !== 'items') {
        res.status(500).end('not supported item');
        return;
    }

    const resourceId = params[params.length - 1];
    const projectId = params[params.length - 3];

    try {
        const items = new ItemsApi();
        const folder = await items.getItemParentFolder(projectId, resourceId, req.oauth_client, req.oauth_token);
        if(folder === null || folder.statusCode !== 200){
            console.log('failed to get the parent folder.');
            res.status(500).end('ailed to get the parent folder');
            return;
        }

        const fileParams = fileItemName.split('.');
        const fileExtension = fileParams[fileParams.length-1].toLowerCase();
        if( fileExtension !== 'rvt' && fileExtension !== 'rfa' && fileExtension !== 'fte'){
            console.log('info: the file format is not supported');
            res.status(500).end('the file format is not supported');
            return;
        }

        const storageInfo = await getNewCreatedStorageInfo(projectId, folder.body.data.id, fileItemName, req.oauth_client, req.oauth_token);
        if (storageInfo === null ) {
            console.log('failed to create the storage');
            res.status(500).end('failed to create the storage');
            return;
        }
        const outputUrl = storageInfo.StorageUrl;


        // get the storage of the input item version
        const versionInfo = await getLatestVersionInfo(projectId, resourceId, req.oauth_client, req.oauth_token);
        if (versionInfo === null ) {
            console.log('failed to get lastest version of the file');
            res.status(500).end('failed to get lastest version of the file');
            return;
        }
        const inputUrl = versionInfo.versionUrl;

        const createVersionBody = createBodyOfPostVersion(resourceId,fileItemName, storageInfo.StorageId, versionInfo.versionType);
        if (createVersionBody === null ) {
            console.log('failed to create body of Post Version');
            res.status(500).end('failed to create body of Post Version');
            return;
        }

        ////////////////////////////////////////////////////////////////////////////////
        // use 2 legged token for design automation
        const oauth = new OAuth(req.session);
        const oauth_client = oauth.get2LeggedClient();;
        const oauth_token = await oauth_client.authenticate();
        let upgradeRes = await upgradeFile(inputUrl, outputUrl, projectId, createVersionBody, fileExtension, req.oauth_token, oauth_token );
        if(upgradeRes === null || upgradeRes.statusCode !== 200 ){
            console.log('failed to upgrade the revit file');
            res.status(500).end('failed to upgrade the revit file');
            return;
        }
        console.log('Submitted the workitem: '+ upgradeRes.body.id);
        const upgradeInfo = {
            "fileName": fileItemName,
            "workItemId": upgradeRes.body.id,
            "workItemStatus": upgradeRes.body.status
        };
        res.status(200).end(JSON.stringify(upgradeInfo));

    } catch (err) {
        console.log('get exception while upgrading the file')
        res.status(500).end(err);
    }
});


///////////////////////////////////////////////////////////////////////
///
///
///////////////////////////////////////////////////////////////////////
router.post('/da4revit/v1/upgrader/files/:source_file_url/folders/:destinate_folder_url', async (req, res, next) => {
    const sourceFileUrl = (req.params.source_file_url); 
    const destinateFolderUrl = (req.params.destinate_folder_url);
    if (sourceFileUrl === '' || destinateFolderUrl === '') {
        res.status(400).end('make sure sourceFile and destinateFolder have correct value');
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
    if (sourceFileType !== 'items' || destinateFolderType !== 'folders') {
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
        if (versionInfo === null) {
            console.log('error: failed to get lastest version of the file');
            res.status(500).end('failed to get lastest version of the file');
            return;
        }
        const inputUrl = versionInfo.versionUrl;

        const items = new ItemsApi();
        const sourceFile = await items.getItem(sourceProjectId, sourceFileId, req.oauth_client, req.oauth_token);
        if (sourceFile === null || sourceFile.statusCode !== 200) {
            console.log('error: failed to get the current file item.');
            res.status(500).end('failed to get the current file item');
            return;
        }
        const fileName = sourceFile.body.data.attributes.displayName;
        const itemType = sourceFile.body.data.attributes.extension.type;

        const fileParams = fileName.split('.');
        const fileExtension = fileParams[fileParams.length-1].toLowerCase();
        if( fileExtension !== 'rvt' && fileExtension !== 'rfa' && fileExtension !== 'fte'){
            console.log('info: the file format is not supported');
            res.status(500).end('the file format is not supported');
            return;
        }
    
        ////////////////////////////////////////////////////////////////////////////////
        // create a new storage for the ouput item version
        const storageInfo = await getNewCreatedStorageInfo(destinateProjectId, destinateFolderId, fileName, req.oauth_client, req.oauth_token);
        if (storageInfo === null) {
            console.log('error: failed to create the storage');
            res.status(500).end('failed to create the storage');
            return;
        }
        const outputUrl = storageInfo.StorageUrl;

        const createFirstVersionBody = createBodyOfPostItem(fileName, destinateFolderId, storageInfo.StorageId, itemType, versionInfo.versionType)
        if (createFirstVersionBody === null) {
            console.log('failed to create body of Post Item');
            res.status(500).end('failed to create body of Post Item');
            return;
        }

        
        ////////////////////////////////////////////////////////////////////////////////
        // use 2 legged token for design automation
        const oauth = new OAuth(req.session);
        const oauth_client = oauth.get2LeggedClient();;
        const oauth_token = await oauth_client.authenticate();
        let upgradeRes = await upgradeFile(inputUrl, outputUrl, destinateProjectId, createFirstVersionBody,fileExtension, req.oauth_token, oauth_token);
        if (upgradeRes === null || upgradeRes.statusCode !== 200) {
            console.log('failed to upgrade the revit file');
            res.status(500).end('failed to upgrade the revit file');
            return;
        }
        console.log('Submitted the workitem: '+ upgradeRes.body.id);
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


///////////////////////////////////////////////////////////////////////
/// Cancel the file upgrade process if possible.
/// NOTE: This may not successful if the upgrade process is already started
///////////////////////////////////////////////////////////////////////
router.delete('/da4revit/v1/upgrader/files/:file_workitem_id', async(req, res, next) =>{

    const workitemId = req.params.file_workitem_id;
    try {
        const oauth = new OAuth(req.session);
        const oauth_client = oauth.get2LeggedClient();;
        const oauth_token = await oauth_client.authenticate();
        await cancelWrokitem(workitemId, oauth_token.access_token);
        let workitemStatus = {
            'WorkitemId': workitemId,
            'Status': "Cancelled"
        };

        const workitem = workitemList.find( (item) => {
            return item.workitemId === workitemId;
        } )
        if( workitem === undefined ){
            console.log('the workitem is not in the list')
            return;
        }
        console.log('The workitem: ' + workitemId + ' is cancelled')
        let index = workitemList.indexOf(workitem);
        workitemList.splice(index, 1);

        global.MyApp.SocketIo.emit(SOCKET_TOPIC_WORKITEM, workitemStatus);
        res.status(204).end();
    } catch (err) {
        res.status(500).end("error");
    }
})

///////////////////////////////////////////////////////////////////////
/// Query the status of the file
///////////////////////////////////////////////////////////////////////
router.get('/da4revit/v1/upgrader/files/:file_workitem_id', async(req, res, next) => {
    const workitemId = req.params.file_workitem_id;
    try {
        const oauth = new OAuth(req.session);
        const oauth_client = oauth.get2LeggedClient();;
        const oauth_token = await oauth_client.authenticate();        
        let workitemRes = await getWorkitemStatus(workitemId, oauth_token.access_token);
        res.status(200).end(JSON.stringify(workitemRes.body));
    } catch (err) {
        res.status(500).end("error");
    }
})


///////////////////////////////////////////////////////////////////////
///
///////////////////////////////////////////////////////////////////////
router.post('/callback/designautomation', async (req, res, next) => {
    // Best practice is to tell immediately that you got the call
    // so return the HTTP call and proceed with the business logic
    res.status(202).end();

    let workitemStatus = {
        'WorkitemId': req.body.id,
        'Status': "Success"
    };
    if (req.body.status === 'success') {
        const workitem = workitemList.find( (item) => {
            return item.workitemId === req.body.id;
        } )

        if( workitem === undefined ){
            console.log('The workitem: ' + req.body.id+ ' to callback is not in the item list')
            return;
        }
        let index = workitemList.indexOf(workitem);
        workitemStatus.Status = 'Success';
        global.MyApp.SocketIo.emit(SOCKET_TOPIC_WORKITEM, workitemStatus);
        console.log("Post handle the workitem:  " + workitem.workitemId);

        const type = workitem.createVersionData.data.type;
        try {
            let version = null;
            if(type === "versions"){
                const versions = new VersionsApi();
                version = await versions.postVersion(workitem.projectId, workitem.createVersionData, req.oauth_client, workitem.access_token_3Legged);
            }else{
                const items = new ItemsApi();
                version = await items.postItem(workitem.projectId, workitem.createVersionData, req.oauth_client, workitem.access_token_3Legged);
            }
            if( version === null || version.statusCode !== 201 ){ 
                console.log('Falied to create a new version of the file');
                workitemStatus.Status = 'Failed'
            }else{
                console.log('Successfully created a new version of the file');
                workitemStatus.Status = 'Completed';
            }
            global.MyApp.SocketIo.emit(SOCKET_TOPIC_WORKITEM, workitemStatus);

        } catch (err) {
            console.log(err);
            workitemStatus.Status = 'Failed';
            global.MyApp.SocketIo.emit(SOCKET_TOPIC_WORKITEM, workitemStatus);
        }
        finally{
            // Remove the workitem after it's done
            workitemList.splice(index, 1);
        }

    }else{
        // Report if not successful.
        workitemStatus.Status = 'Failed';
        global.MyApp.SocketIo.emit(SOCKET_TOPIC_WORKITEM, workitemStatus);
        console.log(req.body);
    }
    return;
})



module.exports = router;
