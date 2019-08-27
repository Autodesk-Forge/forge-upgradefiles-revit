// (C) Copyright 2011 by Autodesk, Inc. 
//
// Permission to use, copy, modify, and distribute this software
// in object code form for any purpose and without fee is hereby
// granted, provided that the above copyright notice appears in
// all copies and that both that copyright notice and the limited
// warranty and restricted rights notice below appear in all
// supporting documentation.
//
// AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS. 
// AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
// MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK,
// INC. DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL
// BE UNINTERRUPTED OR ERROR FREE.
//
// Use, duplication, or disclosure by the U.S. Government is
// subject to restrictions set forth in FAR 52.227-19 (Commercial
// Computer Software - Restricted Rights) and DFAR 252.227-7013(c)
// (1)(ii)(Rights in Technical Data and Computer Software), as
// applicable.
//

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
            String filePath = Directory.GetCurrentDirectory() + @"\Change to your local legacy RFA file for local test";
            DesignAutomationData data = new DesignAutomationData(app, filePath );
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
