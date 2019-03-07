# Create App, Define Activity, Call the WorkItem


# Description
Postman collection to create App, define activity, and call the WorkItem. 

## Setup
`Before start with Design Automaiton workflow, I strongly recommend you to read throught all the details at` [Design Automation for Revit Documenation](https://forge.autodesk.com/en/docs/design-automation/v3),` and check the following steps if you already have basic understanding.`

1. Download or update Postman from [here](https://www.getpostman.com/apps).

2. Create a Forge App. If you have already created a Forge App then you can skip this and proceed to the next step. 

3. From your local clone of the repository, import our `Postman collections` [Design Automation V3 Samples Collection](Design_Automation_V3_Samples.postman_collection.json) into the Postman application.  You can find more details about collections [here](https://www.getpostman.com/docs/v6/postman/collections/intro_to_collections)

4. From your local clone of the repository, import our `Postman environment` [Design Automation V3 Samples Environment](Design_Automation_V3_Samples.postman_environment.json) into the Postman application. You can find more details about managing and editing environment variables [here](https://www.getpostman.com/docs/v6/postman/environments_and_globals/manage_environments). 

5. Select the environment and enter your [Forge App's](https://developer.autodesk.com/myapps) `Client ID` and `Client Secret`. This is used for authentication. In the environment variables give your app an easy to manage unique nickname.

6. Compile and package the sample applications as noted [here](https://forge.autodesk.com/en/docs/design-automation/v3/tutorials/revit/step4-publish-appbundle/). You will need this to upload the app to Design Automation. Alternatively you may also download the packages from [FileUpgraderApp.zip](../PlugIn/FileUpgraderApp.zip).

7. Prepare your input and output url. You need to upload an old version of revit file as input Url, you can use [Revit2014.rvt](./Revit2014.rvt) for test.

8. Before following the steps from collection, create a NickName for your App first.

9. Follow Step from 0 ~ 7, this will create an AppBundle, define an Activity and post a WorkItem. 

10. You can use Get command to list the AppBundles/Activities.

11. You can use Delete command to delete the AppBundle/Activity and start the workflow from Step 0 ~ 7 again.


## Usage

These Postman samples will allow you to easily issue REST API calls without using cumbersome cURL commands.

Note that you will have to carefully read through the requests - `DELETE`-ing an `app` or `activity` will delete all its associated versions!

Note that for all `workitems` kindly provide signed URL for the expected output file. Else the `workitem` post will result with `failedUpload`.

REST API documentation on Design Automation V3 can be found [here](https://forge.autodesk.com/en/docs/design-automation/v3/reference/http/).


## Reference

A more complicated step by step instructional video can be found [here](https://s3.amazonaws.com/revitio/documentation/PostmanSamples.mp4), the main steps should be similar.


# Written by
Design Automation Postman collection and environment, Updated by Zhong Wu, [Forge Partner Development](http://forge.autodesk.com)
