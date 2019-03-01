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
    url: '/api/forge/oauth/v1/token',
    success: function (res) {
      // yes, it is signed in...
      $('#autodeskSignOutButton').show();
      $('#autodeskSigninButton').hide();

      $('#refreshSourceHubs').show();
      
      // add right panel
      $('#refreshDestinationHubs').show();

      // prepare sign out
      $('#autodeskSignOutButton').click(function () {
        $('#hiddenFrame').on('load', function (event) {
          location.href = '/api/forge/oauth/v1/signout';
        });
        $('#hiddenFrame').attr('src', 'https://accounts.autodesk.com/Authentication/LogOut');
        // learn more about this signout iframe at
        // https://forge.autodesk.com/blog/log-out-forge
      })

      // and refresh button
      $('#refreshSourceHubs').click(function () {
        $('#sourceHubs').jstree(true).refresh();
      });

      $('#refreshDestinationHubs').click(function () {
        $('#destinationHubs').jstree(true).refresh();
      });

      prepareUserHubsTree( '#sourceHubs' );
      prepareUserHubsTree( '#destinationHubs');
      showUser();
    },
    error: function(err){
      $('#autodeskSignOutButton').hide();
      $('#autodeskSigninButton').show();
    }
  });

  $('#autodeskSigninButton').click(function () {
    jQuery.ajax({
      url: '/api/forge/oauth/v1/url',
      success: function (url) {
        location.href = url;
      }
    });
  })

  $.getJSON("/api/forge/oauth/v1/clientid", function (res) {
    $("#ClientID").val(res.id);
    $("#provisionAccountSave").click(function () {
      $('#provisionAccountModal').modal('toggle');
      $('#sourceHubs').jstree(true).refresh();
      $('#destinationHubs').jstree(true).refresh();
    });
  });  

  $('#upgradeBtn').click(async function () {
    let sourceNode = $('#sourceHubs').jstree(true).get_selected(true)[0];
    if(sourceNode === null){
      alert('Can not get the selected source folder, please make sure you select a folder as source');
      return;
    }
    destinatedNode  = $('#destinationHubs').jstree(true).get_selected(true)[0];
    if(destinatedNode === null){
      alert('Can not get the destinate folder, please make sure you select a folder as destination');
      return;
    }

    if(sourceNode.type !== 'folders' || destinatedNode.type !== 'folders'){
      alert('Currently only support upgrading files from folder to folder, please make sure select folder as source and destination.');
      return;
    }

    // TBD: use the current selection of version & action
    bUpgrade2019 =  $('input[name="upgradeToVersion"]:checked').val() === '2019';
    bIgnore      =  $('input[name="fileExisted"]:checked').val() === 'skip';

    bSupportRvt = $('#supportRvtCbx')[0].checked;
    bSupportRfa = $('#supportRfaCbx')[0].checked;
    bSupportRte = $('#supportRteCbx')[0].checked;

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
        
    document.getElementById('upgradeTitle').innerHTML ="<h4>Start upgrading Revit files(Limitation: 5 Files Maximun)...</h4>";
    fileNumber = 0;
    await upgradeFolder(sourceNode, destinatedNode);
    document.getElementById('upgradeTitle').innerHTML ="<h4>Creating versions in BIM360(Limitation: 5 Files Maximun)...</h4>";
  });
});

var bSupportRvt = true;
var bSupportRfa = true;
var bSupportRte = true;
var bIgnore     = true;
var bUpgrade2019= true;

const FileLimitation = 5;
var fileNumber = 0;

const ItemType = {
  FILE : 1,
  FOLDER: 2
};

const LabelIdEndfix  = '-item';
const CancelIdEndfix = '-cancel';

var workitemList    = new Array();
var destinatedNode  = null;
var sourceNode      = null;

const SOCKET_TOPIC_WORKITEM          = 'Workitem-Notification';

socketio = io();
socketio.on(SOCKET_TOPIC_WORKITEM, async (data)=>{
  console.log(data);
  updateListItem(data.WorkitemId, data.Status);
  if(data.Status.toLowerCase() === 'completed' || data.Status.toLowerCase() === 'failed' || data.Status.toLowerCase() === 'cancelled'){
    workitemList.pop(data.WorkitemId);
  }
  // Mark as finished when the workitemList is empty
  if(workitemList.length === 0){
    let upgradeBtnElm = document.getElementById('upgradeBtn');
    upgradeBtnElm.disabled = false;
    document.getElementById('upgradeTitle').innerHTML ="<h4>Upgrade Fully Completed!</h4>";

    // refresh the selected node
    if(sourceNode !== null){
      let instance = $('#sourceHubs').jstree(true);
      instance.refresh_node(sourceNode);
      sourceNode = null;
    }
    if(destinatedNode !== null ){
      let instance = $('#destinationHubs').jstree(true);
      instance.refresh_node(destinatedNode);
      destinatedNode = null;
    }
 }
})

async function upgradeFolder(sourceNode, destinationNode) {
  if (sourceNode === null || sourceNode.type !== 'folders')
    return false;

  if (destinationNode === null || destinationNode.type !== 'folders')
    return false;

  let instance = $("#sourceHubs").jstree(true);
  instance.open_node(sourceNode, async function(e, data){
    let childrenDom = e.children;

    for (let i = 0; i < childrenDom.length; i++) {
      let nodeDom = childrenDom[i];
      let node = instance.get_json(nodeDom);
  
      if (node.type === 'folders') {
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
      if (node.type === 'items') {
        const fileParts     = node.text.split('.');
        const fileExtension = fileParts[fileParts.length-1].toLowerCase();
        if ((bSupportRvt && fileExtension === 'rvt') ||
          (bSupportRfa && fileExtension === 'rfa') ||
          (bSupportRte && fileExtension === 'rte')) {
          if (fileNumber++ >= FileLimitation) {
            return;
          }
          try {
            let upgradeInfo = await upgradeFileToFolder(node.id, destinationNode.id);
            workitemList.push(upgradeInfo.workItemId);
            addGroupListItem(node.text, upgradeInfo.workItemStatus, ItemType.FILE, 'list-group-item-info', upgradeInfo.workItemId);
          } catch (err) {
            addGroupListItem(node.text, 'failed', ItemType.FILE, 'list-group-item-danger');
          }
        }
      }
    }
  
  }, true);
};


function upgradeFileToFolder(sourceFile, destinateFolder){  
  let def = $.Deferred();

  if (sourceFile === null || destinateFolder === null ){
    def.reject('input parameters are null');
    return def.promise();
  }
  encodeURIComponent()
  
  jQuery.post({
    url: '/api/forge/da4revit/v1/upgrader/files/'+encodeURIComponent(sourceFile)+'/folders/'+encodeURIComponent(destinateFolder),
    contentType: 'application/json',
    dataType: 'json',
    data: JSON.stringify({ 'sourceFile': sourceFile, 'destinateFolder': destinateFolder }),
    success: function (res) {
      def.resolve(res);
    },
    error: function (err) {
      def.reject(err);
    }
  });

  return def.promise();
}

function upgradeFile(node) {
  let def = $.Deferred();

  if (node === null) {
    def.reject('selected item is null');
    return def.promise();
  }

  const fileItemId   = node.id;
  const fileItemName = node.text;

  jQuery.post({
    url: '/api/forge/da4revit/v1/upgrader/files',
    contentType: 'application/json',
    dataType:'json',
    data: JSON.stringify({
      'fileItemId': fileItemId,
      'fileItemName': fileItemName
    }),
    success: function (res) {
      def.resolve(res);
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
        "url": '/api/forge/datamanagement/v1',
        "dataType": "json",
        'cache': false,
        'data': function (node) {
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
    contextmenu: { items: (userHubs === '#sourceHubs'? autodeskCustomMenuSource: autodeskCustomMenuDestination)},
    "state": { "key": userHubs }// key restore tree state
  }).bind("activate_node.jstree", function (evt, data) {
  });
}


function autodeskCustomMenuSource(autodeskNode) {
  var items;

  switch (autodeskNode.type) {
    case "items":
      items = {
        upgradeFile: {
          label: "Upgrade to Revit 2019",
          action: async function () {
            try{
              let logList = document.getElementById('logStatus');
              let index   = logList.childElementCount;
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


function autodeskCustomMenuDestination(autodeskNode) {
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
            try{
              await deleteFolder(autodeskNode);
              // refresh the parent node
              let instance = $('#destinationHubs').jstree(true);
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

  if (node === null) {
    def.reject('selected node is not correct.');
    return def.promise();
  }

  $.ajax({
    url: '/api/forge/datamanagement/v1/folder/' + encodeURIComponent(node.id),
    type: "delete",
    dataType: "json",
    success: function (res) {
      def.resolve(res);
    },
    error: function (err) {
      console.log(err)
      def.reject(err);
    }
  });

  return def.promise();
}


async function createFolder(node) {
  if (node === null) {
    console.log('selected node is not correct.');
    return;
  }

  const folderName = prompt("Please specify the folder name:");
  if (folderName === null || folderName === '')
    return;

  try {
    await createNamedFolder(node, folderName);
  } catch (err) {
    alert("Failed to create folder: " + folderName )
  }

  // refresh the node
  let instance = $('#destinationHubs').jstree(true);
  let selectNode = instance.get_selected(true)[0];
  instance.refresh_node(selectNode);
}

function createNamedFolder(node, folderName) {

  let def = $.Deferred();

  if (node === null || folderName === null || folderName === '') {
    def.reject("parameters are not correct.");
    return def.promise();
  }

  jQuery.post({
    url: '/api/forge/datamanagement/v1/folder',
    contentType: 'application/json',
    dataType: 'json',
    data: JSON.stringify({
      'id': node.id,
      'name': folderName
    }),
    success: function (res) {
      def.resolve(res);
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

  if(workitemId === null || workitemId === ''){
    def.reject("parameters are not correct.");  
    return def.promise();
  }

  $.ajax({
    url: '/api/forge/da4revit/v1/upgrader/files/' + encodeURIComponent(workitemId),
    type: "delete",
    dataType: "json",
    success: function (res) {
      def.resolve(res);
    },
    error: function (err) {
      def.reject(err);
    }
  });
  return def.promise();
}


function getWorkitemStatus( workitemId ){
  let def = $.Deferred();

  if(workitemId === null || workitemId === ''){
    def.reject("parameters are not correct.");  
    return def.promise();
  }

  jQuery.get({
    url: '/api/forge/da4revit/v1/upgrader/files/' + encodeURIComponent(workitemId),
    dataType: 'json',
    success: function (res) {
      def.resolve(res);
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
  if(item !== null){
    item.textContent = ', workitem is: '+ itemId+ ', status is:' + statusStr;
    const statusStrLowercase = statusStr.toLowerCase();
    if(statusStrLowercase === 'success' 
    || statusStrLowercase === 'cancelled'
    || statusStrLowercase === 'completed'
    || statusStrLowercase === 'failed'){
      let cancelBtn = document.getElementById(itemId+CancelIdEndfix);
      if( cancelBtn !== null ){
        cancelBtn.remove();
      }
      item.parentElement.setAttribute('class', (statusStr.toLowerCase() === 'completed')?'list-group-item-success':'list-group-item-warning');
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
          await cancelWorkitem(idParams[0]);
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
  }
  $('#logStatus')[0].appendChild(li);
}

function showUser() {
  jQuery.ajax({
    url: '/api/forge/user/v1/profile',
    success: function (profile) {
      var img = '<img src="' + profile.picture + '" height="20px">';
      $('#userInfo').html(img + profile.name);
    }
  });
}
