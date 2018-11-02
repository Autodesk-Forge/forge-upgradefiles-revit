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

$(document).ready(function () {
  // first, check if current visitor is signed in
  jQuery.ajax({
    url: '/api/forge/oauth/token',
    success: function (res) {
      // yes, it is signed in...
      $('#signOut').show();
      $('#autodeskSigninButton').hide();

      $('#refreshHubs').show();
      
      // add right panel
      $('#refreshHubsRight').show();

      // prepare sign out
      $('#signOut').click(function () {
        $('#hiddenFrame').on('load', function (event) {
          location.href = '/api/forge/oauth/signout';
        });
        $('#hiddenFrame').attr('src', 'https://accounts.autodesk.com/Authentication/LogOut');
        // learn more about this signout iframe at
        // https://forge.autodesk.com/blog/log-out-forge

        $('#signOut').hide();
        $('#autodeskSigninButton').show();
      })

      // and refresh button
      $('#refreshHubs').click(function () {
        $('#userHubs').jstree(true).refresh();
      });

      $('#refreshHubsRight').click(function () {
        $('#userHubsRight').jstree(true).refresh();
      });

      // finally:
      prepareUserHubsTree( '#userHubs' );
      prepareUserHubsTree( '#userHubsRight');
      showUser();
    }
  });

  $('#autodeskSigninButton').click(function () {
    jQuery.ajax({
      url: '/api/forge/oauth/url',
      success: function (url) {
        location.href = url;
      }
    });
  })


  $('#upgradeBtn').click(async function () {
    let sourceNode = $('#userHubs').jstree(true).get_selected(true)[0];
    if(sourceNode == null){
      alert('Can not get the selected source folder, please make sure you select a folder as source');
      return;
    }
    destinatedNode  = $('#userHubsRight').jstree(true).get_selected(true)[0];
    if(destinatedNode == null){
      alert('Can not get the destinate folder, please make sure you select a folder as destination');
      return;
    }

    if(sourceNode.type != 'folders' || destinatedNode.type != 'folders'){
      alert('Currently only support upgrading files from folder to folder, please make sure select folder as source and destination.');
      return;
    }

    // remove items if any.
    let logList = document.getElementById('logStatus');
    let index = logList.childElementCount;
    while(index > 0){
      logList.removeChild(logList.firstElementChild);
      index--;
    }

    // Disable the upgrade button    
    let upgradeBtnElm = document.getElementById('upgradeBtn');
    upgradeBtnElm.disabled = true;
        
    document.getElementById('upgradeTitle').innerHTML ="<h4>Start upgrading Revit files...</h4>";
    await upgradeFolder(sourceNode, destinatedNode);
    document.getElementById('upgradeTitle').innerHTML ="<h4>Creating versions in BIM360...</h4>";
  });
  
  $('#cancelBtn').click(function () {
  
  });

  $('#supportRvtCbx').click(function(){
    bSupportRvt = this.checked;
  })

  $('#supportRfaCbx').click(function(){
    bSupportRfa = this.checked;
  })

  $('#supportRteCbx').click(function(){
    bSupportRte = this.checked;
  })

  $('#ignoreRbx').click(function(){
    bIgnore = true;
  })

  $('#overrideRbx').click(function(){
    bIgnore = false;
  })

  $('#upgrade2018Rbx').click(function(){
    bUpgrade2019 = false;
  })  
  
  $('#upgrade2019Rbx').click(function(){
    bUpgrade2019 = true;
  })  
});

var bSupportRvt = true;
var bSupportRfa = true;
var bSupportRte = true;
var bIgnore     = true;
var bUpgrade2019= true;

const ItemType = {
  FILE : 1,
  FOLDER: 2,
  ISSUE: 3
};

const LabelIdEndfix = '-item';
// const QueryIdEndfix = '-query';
const CancelIdEndfix = '-cancel';

var workitemList = new Array();
var destinatedNode  = null;
var sourceNode      = null;
//replace with your suitable topic names 
const SOCKET_TOPIC_WORKITEM          = 'Workitem-Notification';

//replace with your own website
const baseurl = 'http://localhost:3000';

socketio = io.connect(baseurl);
socketio.on(SOCKET_TOPIC_WORKITEM, async (data)=>{
  console.log(data);
  updateListItem(data.WorkitemId, data.Status);
  if(data.Status.toLowerCase() == 'completed' || data.Status.toLowerCase() == 'failed' || data.Status.toLowerCase() == 'cancelled'){
    workitemList.pop(data.WorkitemId);
  }
  // start to create the project issue when it's done
  if(workitemList.length == 0){
    if(destinatedNode != null ){
      document.getElementById('upgradeTitle').innerHTML ="<h4>Creating upgrade log issue in BIM 360 ...</h4>";
      let issueRes = await startIssueProcess(destinatedNode)
      //  Set the status when it's done
      let upgradeBtnElm = document.getElementById('upgradeBtn');
      upgradeBtnElm.disabled = false;
    }
    document.getElementById('upgradeTitle').innerHTML ="<h4>Upgrade Fully Completed!</h4>";
    // refresh the selected node
    if(sourceNode != null){
      let instance = $('#userHubs').jstree(true);
      instance.refresh_node(sourceNode);
      sourceNode = null;
    }
    if(destinatedNode != null ){
      let instance = $('#userHubsRight').jstree(true);
      instance.refresh_node(destinatedNode);
      destinatedNode = null;
    }
 }
})


async function startIssueProcess(destinationNode) {
  if (destinationNode == null) {
    console.log('destinated folder is not selected');
    return null;
  }

  const folderIdParams = destinationNode.id.split('/');
  const folderId = folderIdParams[folderIdParams.length - 1];

  let parents = destinationNode.parents;
  if (parents == null || parents.length < 3) {
    console.log('destinated select must be a folder');
    alert('please select a folder');
    return null;
  }

  const projectIdParams = parents[parents.length - 3].split('/');
  const hubId = projectIdParams[projectIdParams.length - 3];
  const projectId = projectIdParams[projectIdParams.length - 1];
  let input = {
    "hubId": hubId,
    "projectId": projectId,
    "folderId": folderId
  }
  try {
    let issueRes = await createProjectIssue(input);
    addGroupListItem("Project Issue: " + issueRes.issue_id, "created", ItemType.ISSUE, 'list-group-item-danger');
    return issueRes;
  } catch (err) {
    addGroupListItem("Project Issue ", 'failed', ItemType.ISSUE, 'list-group-item-danger');
  }
  return null;

}


function createProjectIssue(input){
  let def = $.Deferred();

  if (input == null) {
    def.reject('parameter is null');
    return def.reject('parameter is null');
  }

  // create the body of the group list item
  let logBody = createLogJson();

  jQuery.post({
    url: '/api/forge/bim360/issue/doc',
    contentType: 'application/json',
    data: JSON.stringify({
      'hubId': input.hubId,
      'projectId': input.projectId,
      'folderId' : input.folderId,
      'logBody': logBody
    }),
    success: function (res) {
      def.resolve(JSON.parse(res));
    },
    error: function (err) {
      def.reject(err);
    }
  });
  return def.promise();
}


function createLogJson(){

  let logGroup = document.getElementById('logStatus');
  let logItems = logGroup.children;
  let text = '';
  let allFileCount = 0;
  let goodFileCount = 0;
  for( let index=0; index<logItems.length; index++ ){
    text = text + logItems[index].textContent +' \n ';

    const params = logItems[index].textContent.split(':');
    if( params[params.length-1].toLowerCase() == 'completed') {
      goodFileCount++;
    }
    if( params[0].toLowerCase() != 'folder'){
      allFileCount++;
    }
  }
  const logContent = {
    FileCount : allFileCount,
    SuccessFileCount : goodFileCount,
    Body : text

  }
  return logContent;
}


async function upgradeFolder(sourceNode, destinationNode) {
  if (sourceNode == null || sourceNode.type != 'folders')
    return false;

  if (destinationNode == null || destinationNode.type != 'folders')
    return false;

  let instance = $("#userHubs").jstree(true);

  let childrenDom = instance.get_children_dom(sourceNode);

  for (let i = 0; i < childrenDom.length; i++) {
    let nodeDom = childrenDom[i];
    let node = instance.get_json(nodeDom);

    if (node.type == 'folders') {
      let content = null;
      let destinatedSubFolder = null;
      try {
        destinatedSubFolder = await createNamedFolder(destinationNode, node.text)
        addGroupListItem(node.text, 'created', ItemType.FOLDER, 'active' )
      } catch (err) {
        addGroupListItem(node.text, 'failed', ItemType.FOLDER, 'list-group-item-danger' )
      }
      try{
        await upgradeFolder(node, destinatedSubFolder);
      }catch(err){
        addGroupListItem(node.text,'failed', ItemType.FOLDER, 'list-group-item-danger' )
      }
    }
    if (node.type == 'items') {
      // ignore any not supported file
      const fileParts = node.text.split('.');
      const fileExtension = fileParts[fileParts.length-1].toLowerCase();
      if( (bSupportRvt && fileExtension=='rvt') || (bSupportRfa && fileExtension == 'rfa') || (bSupportRte && fileExtension == 'rte'  )){

        let content = null;
        try {
          let upgradeInfo = await upgradeFileToFolder(node.id, destinationNode.id);
          workitemList.push(upgradeInfo.workItemId);
          addGroupListItem(node.text, upgradeInfo.workItemStatus, ItemType.FILE, 'list-group-item-info', upgradeInfo.workItemId  );
        } catch (err) {
          addGroupListItem(node.text, 'failed', ItemType.FILE, 'list-group-item-danger' );
        }
      } 
    }
  }
};


function upgradeFileToFolder(sourceFile, destinateFolder){  
  let def = $.Deferred();

  if (sourceFile == null || destinateFolder == null ){
    def.reject('input parameters are null');
    return def.promise();
  }
  
  jQuery.post({
    url: '/api/forge/da4revit/upgradeToFolder',
    contentType: 'application/json',
    data: JSON.stringify({ 'sourceFile': sourceFile, 'destinateFolder': destinateFolder }),
    success: function (res) {
      def.resolve(JSON.parse(res));
    },
    error: function (err) {
      def.reject(err);
    }
  });

  return def.promise();
}

function upgradeFile(node) {
  let def = $.Deferred();

  if (node == null) {
    def.reject('selected item is null');
    return def.promise();
  }

  const id = node.id;
  const text = node.text;

  jQuery.post({
    url: '/api/forge/da4revit/upgrade',
    contentType: 'application/json',
    data: JSON.stringify({
      'id': id,
      'name': text
    }),
    success: function (res) {
      def.resolve(JSON.parse(res));
    },
    error: function (err) {
      def.reject(err);
    }
  });
  return def.promise();
}

function prepareUserHubsTree( userHubs) {
  $(userHubs).jstree({
    'core': {
      'themes': { "icons": true },
      'multiple': false,
      'data': {
        "url": '/api/forge/datamanagement',
        "dataType": "json",
        'cache': false,
        'data': function (node) {
          // $(userHubs).jstree(true).toggle_node(node);
          return { "id": node.id };
        }
      }
    },
    'types': {
      'default': {
        'icon': 'glyphicon glyphicon-question-sign'
      },
      '#': {
        'icon': 'glyphicon glyphicon-user'
      },
      'hubs': {
        'icon': 'https://github.com/Autodesk-Forge/bim360appstore-data.management-nodejs-transfer.storage/raw/master/www/img/a360hub.png'
      },
      'personalHub': {
        'icon': 'https://github.com/Autodesk-Forge/bim360appstore-data.management-nodejs-transfer.storage/raw/master/www/img/a360hub.png'
      },
      'bim360Hubs': {
        'icon': 'https://github.com/Autodesk-Forge/bim360appstore-data.management-nodejs-transfer.storage/raw/master/www/img/bim360hub.png'
      },
      'bim360projects': {
        'icon': 'https://github.com/Autodesk-Forge/bim360appstore-data.management-nodejs-transfer.storage/raw/master/www/img/bim360project.png'
      },
      'a360projects': {
        'icon': 'https://github.com/Autodesk-Forge/bim360appstore-data.management-nodejs-transfer.storage/raw/master/www/img/a360project.png'
      },
      'items': {
        'icon': 'glyphicon glyphicon-file'
      },
      'folders': {
        'icon': 'glyphicon glyphicon-folder-open'
      },
      'versions': {
        'icon': 'glyphicon glyphicon-time'
      },
      'unsupported': {
        'icon': 'glyphicon glyphicon-ban-circle'
      }
    },
    "plugins": ["types", "state", "sort", "contextmenu"],
    contextmenu: { items: (userHubs=='#userHubs'? autodeskCustomMenu: autodeskCustomMenuRight)},
    "state": { "key": "autodeskHubs" }// key restore tree state
  }).bind("activate_node.jstree", function (evt, data) {
    if (data != null && data.node != null && data.node.type == 'versions') {
      $("#forgeViewer").empty();
      var urn = data.node.id;
      launchViewer(urn);
    }
  });
}



function autodeskCustomMenu(autodeskNode) {
  var items;

  switch (autodeskNode.type) {
    case "items":
      items = {
        upgradeFile: {
          label: "Upgrade to Revit 2019",
          action: async function () {
            try{
              // remove items if any.
              let logList = document.getElementById('logStatus');
              let index = logList.childElementCount;
              while(index > 0){
                logList.removeChild(logList.firstElementChild);
                index--;
              }

              document.getElementById('upgradeTitle').innerHTML ="<h4>Start upgrading Revit files...</h4>";
              let upgradeInfo = await upgradeFile(autodeskNode);
              sourceNode = autodeskNode;
              workitemList.push(upgradeInfo.workItemId);
              document.getElementById('upgradeTitle').innerHTML ="<h4>Creating versions in BIM360...</h4>";
              addGroupListItem(autodeskNode.text, upgradeInfo.workItemStatus, ItemType.FILE, 'list-group-item-info', upgradeInfo.workItemId  );    
            }catch(err){
              addGroupListItem(autodeskNode.text, 'Failed', ItemType.FILE, 'list-group-item-danger' );
            }
        },
          icon: 'glyphicon glyphicon-transfer'
        }
      };
      break;
  }

  return items;
}


function autodeskCustomMenuRight(autodeskNode) {
  var items;

  switch (autodeskNode.type) {
    case "folders":
      items = {
        createFolder: {
          label: "Create folder",
          action: function () {
            createFolder(autodeskNode);
          },
          icon: 'glyphicon glyphicon-folder-open'
        },
        deleteFolder: {
          label: "Delete folder",
          action: async function () {
            // var treeNode = $('#userHubs').jstree(true).get_selected(true)[0];
            try{
              await deleteFolder(autodeskNode);
              // refresh the parent node
              let instance = $('#userHubsRight').jstree(true);
              selectNode = instance.get_selected(true)[0];
              parentNode = instance.get_parent(selectNode);
              instance.refresh_node(parentNode);

            }catch(err){
              alert("Failed to delete folder: " + autodeskNode.text )
            }
          },
          icon: 'glyphicon glyphicon-remove'
        }       
      };
      break;
  }

  return items;
}


function deleteFolder(node){
  let def = $.Deferred();

  if (node == null) {
    console.log('selected node is not correct.');
    def.reject('selected node is not correct.');
  }

  jQuery.post({
    url: '/api/forge/datamanagement/folder/delete',
    contentType: 'application/json',
    data: JSON.stringify({ 'id': node.id}),
    success: function (res) {
      console.log('folder is deleted.')
      def.resolve('folder is deleted');
    },
    error: function(err){
      def.reject(err);
    }
  });

  return def.promise();
}


async function createFolder(node) {
  if (node == null) {
    console.log('selected node is not correct.');
    return;
  }

  const folderName = prompt("Please specify the folder name:");
  if (folderName == null || folderName == '')
    return;

  try {
    await createNamedFolder(node, folderName);
  } catch (err) {
    alert("Failed to create folder: " + folderName )
  }

  // refresh the node
  let instance = $('#userHubsRight').jstree(true);
  let selectNode = instance.get_selected(true)[0];
  instance.refresh_node(selectNode);
}

function createNamedFolder(node, folderName) {

  let def = $.Deferred();

  if (node == null || folderName == null || folderName == '') {
    console.log('parameters are not correct.');
    def.reject("parameters are not correct.");
  }

  jQuery.post({
    url: '/api/forge/datamanagement/folder',
    contentType: 'application/json',
    data: JSON.stringify({
      'id': node.id,
      'name': folderName
    }),
    success: function (res) {
      console.log(res)
      def.resolve(JSON.parse(res));
    },
    error: function (err) {
      console.log(err)
      def.reject(err);
    }
  });
  return def.promise();
}

function cancelWorkitem( workitemId ){

  let def = $.Deferred();

  if(workitemId == null || workitemId == ''){
    console.log('parameters are not correct.');
    def.reject("parameters are not correct.");  
  }

  jQuery.post({
    url: '/api/forge/da4revit/workitem/cancel',
    contentType: 'application/json',
    data: JSON.stringify({
      'workitemId': workitemId
    }),
    success: function (res) {
      console.log(res)
      def.resolve(JSON.parse(res));
    },
    error: function (err) {
      console.log(err)
      def.reject(err);
    }
  });
  return def.promise();
}

function getWorkitemStatus( workitemId ){
  let def = $.Deferred();

  if(workitemId == null || workitemId == ''){
    console.log('parameters are not correct.');
    def.reject("parameters are not correct.");  
  }

  jQuery.post({
    url: '/api/forge/da4revit/workitem/query',
    contentType: 'application/json',
    data: JSON.stringify({
      'workitemId': workitemId
    }),
    success: function (res) {
      console.log(res)
      def.resolve(JSON.parse(res));
    },
    error: function (err) {
      console.log(err)
      def.reject(err);
    }
  });
  return def.promise();
}

function updateListItem( itemId, statusStr){
  let item = document.getElementById(itemId+ LabelIdEndfix);
  if(item != null){
    item.textContent = ', workitem is: '+ itemId+ ', status is:' + statusStr;
    const statusStrLowercase = statusStr.toLowerCase();
    if(statusStrLowercase == 'success' 
    || statusStrLowercase == 'cancelled'
    || statusStrLowercase == 'completed'
    | statusStrLowercase == 'failed'){
      let cancelBtn = document.getElementById(itemId+CancelIdEndfix);
      if( cancelBtn != null ){
        cancelBtn.remove();
      }
      item.parentElement.setAttribute('class', (statusStr.toLowerCase() == 'completed')?'list-group-item-success':'list-group-item-warning');
    }
  }
}

function addGroupListItem(itemText, statusStr, itemType, itemStyle, itemId) {

  let li = document.createElement('li')
  li.setAttribute('class', 'list-group-item ' + itemStyle);

  let label = document.createElement('label');
  label.setAttribute('id', itemId + LabelIdEndfix);
  switch (itemType) {
    case ItemType.FILE:
      li.textContent = 'File:' + itemText;
      label.textContent = ', workitem is:' + itemId + ', status is:' + statusStr;
      li.appendChild(label)

      let spanCancel = document.createElement('span')
      spanCancel.setAttribute('class', 'btn btn-xs btn-default')
      spanCancel.setAttribute('id', itemId + CancelIdEndfix);
      spanCancel.onclick = async (e) => {
        const idParams = e.currentTarget.id.split('-')
        try {
          let res = await cancelWorkitem(idParams[0]);
          // updateListItem(idParams[0], 'cancelled');
        } catch (err) {
          console.log('failed to cencel the workitem' + idParams[0]);
        }
      };
  
      spanCancel.textContent = 'Cancel';
      li.appendChild(spanCancel)
      break;
    case ItemType.FOLDER:
      li.textContent = 'Folder:' + itemText;
      label.textContent = ', status is:' + statusStr;
      li.appendChild(label)
      break;
    case ItemType.ISSUE:
      li.textContent = 'Issue:' + itemText;
      label.textContent = ', status is:' + statusStr;
      li.appendChild(label)
      break;
  }

  // if (isFileItem) {
  //   // add Cancel button
  //   let spanCancel = document.createElement('span')
  //   spanCancel.setAttribute('class', 'btn btn-xs btn-default')
  //   spanCancel.setAttribute('id', itemId + CancelIdEndfix);
  //   spanCancel.onclick = async (e) => {
  //     const idParams = e.currentTarget.id.split('-')
  //     try {
  //       let res = await cancelWorkitem(idParams[0]);
  //       // updateListItem(idParams[0], 'cancelled');
  //     } catch (err) {
  //       console.log('failed to cencel the workitem' + idParams[0]);
  //     }
  //   };

  //   spanCancel.textContent = 'Cancel';
  //   li.appendChild(spanCancel)
  // }
  $('#logStatus')[0].appendChild(li);
}

function showUser() {
  jQuery.ajax({
    url: '/api/forge/user/profile',
    success: function (profile) {
      var img = '<img src="' + profile.picture + '" height="20px">';
      $('#userInfo').html(img + profile.name);
    }
  });
}
