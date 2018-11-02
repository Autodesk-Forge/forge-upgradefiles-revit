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
const fs      = require('fs');
const {
    ObjectsApi,
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
let router = express.Router();
const hubBucketKey = 'wip.dm.prod';

// Middleware for obtaining a token for each request.
router.use(async (req, res, next) => {
    // Get the access token
    const oauth = new OAuth(req.session);
    const credentials = await oauth.getInternalToken();
    const oauth_client = oauth.getClient();;

    req.oauth_token = credentials;
    req.oauth_client = oauth_client;
    next();
});


router.post('/bim360/issue/doc', async(req, res, next) =>{

    const hubId = decodeURIComponent(req.body.hubId);
    const projectId = decodeURIComponent(req.body.projectId);
    const folderId = decodeURIComponent(req.body.folderId);
    const fileCount = req.body.logBody.FileCount;
    const successFileCount = req.body.logBody.SuccessFileCount;
    const logContent = decodeURIComponent(req.body.logBody.Body);

    if( hubId == '' || projectId == '' || folderId == '' || logContent == ''){
        res.status(400).end('some parameter in body is not correct');
        return;
    }
    const logFileName = 'RevitUpgradeLog.txt';
    // const filePath ='log/'+logFileName;

    try {
        let postStorageBody = createBodyOfPostStorage( folderId, logFileName);
        let storageInfo = await new ProjectsApi().postStorage(projectId, postStorageBody, req.oauth_client, req.oauth_token );
        let objectParts = storageInfo.body.data.id.split('/');
        let objectName = objectParts[objectParts.length-1];
        let object = await new ObjectsApi().uploadObject(hubBucketKey, objectName, logContent.length, logContent, {}, req.oauth_client, req.oauth_token);

        // create version
        const createFirstVersionBody = createBodyOfPostItem(logFileName, folderId, storageInfo.body.data.id, 'items:autodesk.bim360:File', 'versions:autodesk.bim360:File');
        let version = await new ItemsApi().postItem( projectId, createFirstVersionBody, req.oauth_client, req.oauth_token);

        let project = await new ProjectsApi().getProject(hubId, projectId, req.oauth_client, req.oauth_token);
        let input = {
            threeLeggedToken: req.oauth_token.access_token,
            failedFileName: '',
            logFileName: 'RevitFileUpgraderLog',
            logItemUrn: object.body.objectId,
            containterId: project.body.data.relationships.issues.data.id,
            issueTitle: 'Revit File Upgrade Log', 
            assign_to_type: 'user',
            assign_to: '115925126619778', 
            issueDesc: 'Log file containing the detail information about the upgrade job',
            dueDate:'',
            comment: + fileCount + ' files are processed, and '+ (fileCount-successFileCount) + ' files are failed to be upgraded.'
        };
    
        let issueRes = await createWorkflowIssue( input );
        res.status(201).end(JSON.stringify(issueRes.body));

    } catch (err) {
        res.status(500).end('error');
    }
})


var createBodyOfPostStorage = function (folderId, fileName) {

    let body = {
        "data": {
          "relationships": {
            "target": {
              "data": {
                "type": "folders",
                "id": folderId
              }
            }
          },
          "attributes": {
            "name": fileName
          },
          "type": "objects"
        }
      }
      return body;
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
                    "type":'items:autodesk.bim360:File',
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
                        "type":'versions:autodesk.bim360:File',
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

///schema:
///
/*
{
  threeLeggedToken:<3 legged token object>,required
  failedFileName: <the failed file name such as Revit file>,required
  logFileName: <the log file name>,required 
  logItemUrn:<item urn of the log file>, required 
  containterId:<containter id of issue>,required 
  issueTitle:<issue title>, optional, 
  issueDesc: <issue desc>,optional, if provide, better in the format  'YYYY-MM-DD'.
  dueDate: <issue desc>, optional,
  assign_to_type: <assign to type>, optional, in default, type = 'role'
  assign_to: <assign to>,optional. If assign_to_type is specifiied, must provide valid assign_to,
}
*/
/// 
async function createWorkflowIssue(input) {
    try{
        let result = await createIssue(input);
        let issueRes = await createIssueAttachment(result.body);
        let commentRes = await createIssueComment(issueRes.body);
        return commentRes;

    }catch(err){
        console.log(err);
        return null;
    }
}

function createIssue(input) {

    return new Promise(function (resolve, reject) {

        var headers = {
            Authorization: 'Bearer ' +
                input.threeLeggedToken,
            'Content-Type': 'application/vnd.api+json'
        }

        var issueTitle = input.issueTitle === null ?
            input.failedFileName + 'failed to be migrated ' :
            input.issueTitle;

        var issueDesc = input.issueDesc === null ?
            input.failedFileName + 'failed to be migrated. Please refer to log file for details' :
            input.issueDesc;

        var one_day = new Date();
        one_day = one_day.getFullYear() +
            '-' + (one_day.getMonth() + 1) +
            '-' + one_day.getDate();

        var dueDate = (input.dueDate === null || input.dueDate ==='') ? one_day : input.dueDate;

        var assign_to_type = input.assign_to_type === null ? 'role' : input.assign_to_type;
        var assign_to = input.assign_to === null ? 'IT' : input.assign_to;

        request.post({
                url: 'https://developer.api.autodesk.com/issues/v1/containers/' +
                    input.containterId + '/issues',
                headers: headers,
                body: {
                    'data': {
                        'type': 'issues',
                        'attributes': {
                            'title': issueTitle,
                            'description': issueDesc,
                            'status': 'open',
                            'assigned_to': assign_to,
                            'assigned_to_type': assign_to_type,
                            'due_date': dueDate
                        }
                    }
                },
                json: true
            },
            function (error, response, body) {
                if (error) {
                    console.log(error);
                    reject(error);
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
                        input.issue_id = resp.data.id;

                        resolve({
                            statusCode: response.statusCode,
                            headers: response.headers,
                            body: input
                        });
                    }
                }
            });
    });
}

function createIssueAttachment(input) {

    return new Promise(function (resolve, reject) {

        var headers = {
            Authorization: 'Bearer ' +
                input.threeLeggedToken,
            'Content-Type': 'application/vnd.api+json'
        }

        request.post({
                url: 'https://developer.api.autodesk.com/issues/v1/containers/' +
                    input.containterId + '/attachments',
                headers: headers,
                body: {
                    'data': {
                        'type': 'attachments',
                        'attributes': {
                            'issue_id': input.issue_id,
                            'name': input.logFileName,
                            'urn': input.logItemUrn,
                            'urn_type': 'oss',
                            'urn_version': 1
                        }
                    }
                },
                json: true
            },
            function (error, response, body) {
                if (error) {
                    console.log(error);
                    reject(error);
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
                        input.attachment_id = resp.data.id;

                        resolve({
                            statusCode: response.statusCode,
                            headers: response.headers,
                            body: input
                        });
                    }
                }
            });
    });
}


function createIssueComment(input) {

    return new Promise(function (resolve, reject) {

        var headers = {
            Authorization: 'Bearer ' +
                input.threeLeggedToken,
            'Content-Type': 'application/vnd.api+json'
        }

        request.post({
                url: 'https://developer.api.autodesk.com/issues/v1/containers/' +
                    input.containterId + '/comments',
                headers: headers,
                body: {
                    'data': {
                        'type': 'comments',
                        'attributes': {
                            'issue_id': input.issue_id,
                            'body': input.comment
                        }
                    }
                },
                json: true
            },
            function (error, response, body) {
                if (error) {
                    console.log(error);
                    reject(error);
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
                        input.comment_id = resp.data.id;

                        resolve({
                            statusCode: response.statusCode,
                            headers: response.headers,
                            body: input
                        });
                    }
                }
            });
    });
}

module.exports = router;
