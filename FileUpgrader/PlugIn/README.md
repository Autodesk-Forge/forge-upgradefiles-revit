# Revit File Upgrader Addin

# Description

- This Revit addin demostrated how to upgrade Revit file/family to the latest version, it simply use Revit 2018/2019 to open and save the Revit file/family/templete.

- The code is pretty simple, just open the Revit file within the Revit Cloud Engine, and save it. Please refer following for detail:


```
using System;
using System.IO;
using System.Linq;
using Autodesk.Revit.DB;
using Autodesk.Revit.ApplicationServices;

using DesignAutomationFramework;

namespace ADNPlugin.Revit.FileUpgrader
{
    internal class RuntimeValue
    {
        // Change this to true when publishing to Revit IO cloud
        public static bool RunOnCloud { get; } = true;
    }


    [Autodesk.Revit.Attributes.Regeneration(Autodesk.Revit.Attributes.RegenerationOption.Manual)]
    [Autodesk.Revit.Attributes.Transaction(Autodesk.Revit.Attributes.TransactionMode.Manual)]
    public class FileUpgradeApp : IExternalDBApplication
    {
        public ExternalDBApplicationResult OnStartup(ControlledApplication application)
        {
            if (RuntimeValue.RunOnCloud)
            {
                DesignAutomationBridge.DesignAutomationReadyEvent += HandleDesignAutomationReadyEvent;
            }
            else
            {
                // For local test
                application.ApplicationInitialized += HandleApplicationInitializedEvent;
            }
            return ExternalDBApplicationResult.Succeeded;
        }

        public void HandleApplicationInitializedEvent(object sender, Autodesk.Revit.DB.Events.ApplicationInitializedEventArgs e)
        {
            Application app = sender as Application;
            DesignAutomationData data = new DesignAutomationData(app, "C:\\Program Files\\Autodesk\\Revit 2019\\Samples\\Entry Door Handle 2018.rfa");
            UpgradeFile(data);
        }

        public void HandleDesignAutomationReadyEvent( object sender, DesignAutomationReadyEventArgs e)
        {
            e.Succeeded = true;
            UpgradeFile(e.DesignAutomationData);
        }


        protected void UpgradeFile( DesignAutomationData data )
        {
            if (data == null)
                throw new ArgumentNullException(nameof(data));

            Application rvtApp = data.RevitApp;
            if (rvtApp == null)
                throw new InvalidDataException(nameof(rvtApp));

            string modelPath = data.FilePath;
            if (String.IsNullOrWhiteSpace(modelPath))
                throw new InvalidDataException(nameof(modelPath));

            Document doc = data.RevitDoc;
            if (doc == null)
                throw new InvalidOperationException("Could not open document.");

            BasicFileInfo fileInfo = BasicFileInfo.Extract(modelPath);
            if (fileInfo.Format.Equals("2019"))
                return;

            string pathName = doc.PathName;
            string[] pathParts = pathName.Split('\\');
            string[] nameParts = pathParts[pathParts.Length - 1].Split('.');
            string extension = nameParts[nameParts.Length - 1];
            string filePath = "revitupgrade." + extension;
            ModelPath path = ModelPathUtils.ConvertUserVisiblePathToModelPath(filePath);

            SaveAsOptions saveOpts = new SaveAsOptions();
            // Check for permanent preview view
            if (doc
              .GetDocumentPreviewSettings()
              .PreviewViewId
              .Equals(ElementId.InvalidElementId))
            {
                // use 3D view as preview
                View view = new FilteredElementCollector(doc)
                    .OfClass(typeof(View))
                    .Cast<View>()
                    .Where(vw =>
                       vw.ViewType == ViewType.ThreeD && !vw.IsTemplate
                    )
                    .FirstOrDefault();

                if (view != null)
                {
                    saveOpts.PreviewViewId = view.Id;
                }
            }
            doc.SaveAs(path, saveOpts);
        }


        public ExternalDBApplicationResult OnShutdown(ControlledApplication application)
        {

            return ExternalDBApplicationResult.Succeeded;
        }
    };
}

```

## License

This sample is licensed under the terms of the [MIT License](http://opensource.org/licenses/MIT). Please see the [LICENSE](LICENSE) file for full details.

## Written by

Zhong Wu, [Forge Partner Development](http://forge.autodesk.com)
