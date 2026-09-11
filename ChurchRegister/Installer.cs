using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;
[assembly: AssemblyTitle("VWO Church Office Setup")]
[assembly: AssemblyProduct("VWO Church Office")]
[assembly: AssemblyVersion("1.1.0.0")]
[assembly: AssemblyFileVersion("1.1.0.0")]

internal static class ChurchInstaller
{
    private const string Product = "VWO Church Office";
    private const string RegistryPath = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\VWOChurchOffice";
    private static readonly string InstallRoot = Path.GetFullPath(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "VWOChurchOffice"));
    private static readonly string MenuRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), Product);
    private static readonly string DesktopLink = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), Product + ".lnk");

    [STAThread]
    private static int Main(string[] args)
    {
        Application.EnableVisualStyles();
        try
        {
            if (Array.IndexOf(args, "--self-test") >= 0) { SelfTest(); return 0; }
            if (Array.IndexOf(args, "--remove") >= 0) {
                int waitIndex=Array.IndexOf(args,"--wait-for"),parentId;
                if(waitIndex>=0&&waitIndex+1<args.Length&&Int32.TryParse(args[waitIndex+1],out parentId)){
                    try{using(var parent=Process.GetProcessById(parentId)){if(!parent.WaitForExit(10000))throw new Exception("Close the previous setup window, then try uninstalling again.");}}catch(ArgumentException){}
                }
                Uninstall(); return 0;
            }
            if (Array.IndexOf(args, "--uninstall") >= 0)
            {
                if (MessageBox.Show("Remove VWO Church Office from this Windows account? Your church's online records will remain on the server.", Product, MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return 0;
                string helper = Path.Combine(Path.GetTempPath(), "VWO-Uninstall-" + Guid.NewGuid().ToString("N") + ".exe");
                File.Copy(Assembly.GetExecutingAssembly().Location, helper);
                Process.Start(new ProcessStartInfo(helper, "--remove --wait-for " + Process.GetCurrentProcess().Id) { UseShellExecute = true });
                return 0;
            }
            ShowWizard();
            return 0;
        }
        catch (Exception error)
        {
            if (Array.IndexOf(args, "--self-test") >= 0)
            {
                Directory.CreateDirectory(Path.Combine(Environment.CurrentDirectory, "test-results"));
                File.WriteAllText(Path.Combine(Environment.CurrentDirectory, "test-results", "installer-result.txt"), "FAIL: " + error.Message);
            }
            else MessageBox.Show(error.Message, Product, MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
    private static string ValidateOrigin(string value)
    {
        string origin = value.Trim().TrimEnd('/');
        Uri uri;
        if (!Uri.TryCreate(origin, UriKind.Absolute, out uri) || (uri.Scheme != "https" && !(uri.Scheme == "http" && (uri.Host == "localhost" || uri.Host == "127.0.0.1"))))
            throw new Exception("Enter an HTTPS church server address. HTTP is supported only for localhost development.");
        if (uri.UserInfo != "" || uri.Query != "" || uri.Fragment != "" || uri.AbsolutePath != "/") throw new Exception("Enter the server address only, without a page path or login details.");
        return origin;
    }
    private static void ShowWizard()
    {
        var form = new Form { Text = Product + " Setup", ClientSize = new Size(560, 440), FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false, StartPosition = FormStartPosition.CenterScreen, BackColor = Color.FromArgb(248,247,242), Font = new Font("Segoe UI", 10) };
        form.Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location);
        var title = new Label { Text = "A connected home for your church.", Location = new Point(30,28), Size = new Size(500,65), Font = new Font("Segoe UI", 20, FontStyle.Bold), ForeColor = Color.FromArgb(23,63,53) };
        var description = new Label { Text = "Install the church office for your Windows account. Includes Start-menu and desktop shortcuts. No administrator password is needed.", Location = new Point(30,105), Size = new Size(500,60) };
        var label = new Label { Text = "Church server address", Location = new Point(30,185), AutoSize = true };
        var address = new TextBox { Location = new Point(30,212), Width = 500, Text = "https://vwokarati.com" };
        string config = Path.Combine(InstallRoot,"desktop-config.json");
        if (File.Exists(config)) { try { address.Text = new JavaScriptSerializer().Deserialize<Dictionary<string,string>>(File.ReadAllText(config))["server_url"]; } catch {} }
        var hint = new Label { Text = "Use your church's hosted HTTPS address on other computers.\nFor this development PC only: http://localhost:3000\nInternet access and Microsoft Edge are required to use the app.", Location = new Point(30,253), Size = new Size(500,80), ForeColor = Color.FromArgb(90,105,95) };
        var install = new Button { Text = Directory.Exists(InstallRoot) ? "Update installation" : "Install church office", Location = new Point(295,358), Size = new Size(235,45), BackColor = Color.FromArgb(23,63,53), ForeColor = Color.White, FlatStyle = FlatStyle.Flat };
        var cancel = new Button { Text = "Cancel", Location = new Point(30,358), Size = new Size(110,45) };
        cancel.Click += delegate { form.Close(); };
        install.Click += delegate
        {
            try
            {
                string origin = ValidateOrigin(address.Text);
                if (!EdgeExists()) throw new Exception("Microsoft Edge is required. Install Edge and run setup again.");
                install.Enabled = false;
                InstallFiles(InstallRoot, origin);
                Directory.CreateDirectory(MenuRoot);
                Shortcut(Path.Combine(MenuRoot, Product + ".lnk"), Path.Combine(InstallRoot,"VWO-Church-Office.exe"), "");
                Shortcut(Path.Combine(MenuRoot, "Connection settings.lnk"), Path.Combine(InstallRoot,"VWO-Church-Office.exe"), "--configure");
                Shortcut(DesktopLink, Path.Combine(InstallRoot,"VWO-Church-Office.exe"), "");
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(RegistryPath))
                {
                    key.SetValue("DisplayName",Product); key.SetValue("DisplayVersion","1.1.0"); key.SetValue("Publisher","VWO Karati");
                    key.SetValue("InstallLocation",InstallRoot); key.SetValue("DisplayIcon",Path.Combine(InstallRoot,"VWO-Church-Office.exe"));
                    key.SetValue("UninstallString","\""+Path.Combine(InstallRoot,"Uninstall.exe")+"\" --uninstall");
                    key.SetValue("NoModify",1,RegistryValueKind.DWord);key.SetValue("NoRepair",1,RegistryValueKind.DWord);
                }
                MessageBox.Show("Installation complete. Open VWO Church Office from your desktop or Start menu. Connection settings can be changed from the Start menu.",Product,MessageBoxButtons.OK,MessageBoxIcon.Information);
                form.Close();
            }
            catch(Exception error) {install.Enabled=true;MessageBox.Show(error.Message,Product,MessageBoxButtons.OK,MessageBoxIcon.Error);}
        };
        form.Controls.AddRange(new Control[]{title,description,label,address,hint,install,cancel});form.AcceptButton=install;form.CancelButton=cancel;
        Application.Run(form);
    }
    private static bool EdgeExists()
    {
        return File.Exists(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),@"Microsoft\Edge\Application\msedge.exe")) || File.Exists(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),@"Microsoft\Edge\Application\msedge.exe"));
    }
    private static void InstallFiles(string root,string origin)
    {
        Directory.CreateDirectory(root);
        using(var resource=Assembly.GetExecutingAssembly().GetManifestResourceStream("launcher"))
        using(var output=File.Create(Path.Combine(root,"VWO-Church-Office.exe"))) { if(resource==null)throw new Exception("Installer payload is missing.");resource.CopyTo(output); }
        File.WriteAllText(Path.Combine(root,"desktop-config.json"),new JavaScriptSerializer().Serialize(new Dictionary<string,string>{{"server_url",origin}}));
        File.Copy(Assembly.GetExecutingAssembly().Location,Path.Combine(root,"Uninstall.exe"),true);
        File.WriteAllText(Path.Combine(root,"README.txt"),"VWO Church Office 1.1.0\r\nRequires Microsoft Edge and an online church server.\r\nUse the Connection settings Start-menu shortcut to change the server address.\r\nUninstall through Windows Settings > Apps.\r\nYour church records stay on the server; this installation contains no member database.\r\n");
    }
    private static void Shortcut(string path,string target,string arguments)
    {
        object shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));object shortcut=null;
        try{
            shortcut=shell.GetType().InvokeMember("CreateShortcut",BindingFlags.InvokeMethod,null,shell,new object[]{path});
            shortcut.GetType().InvokeMember("TargetPath",BindingFlags.SetProperty,null,shortcut,new object[]{target});
            shortcut.GetType().InvokeMember("Arguments",BindingFlags.SetProperty,null,shortcut,new object[]{arguments});
            shortcut.GetType().InvokeMember("WorkingDirectory",BindingFlags.SetProperty,null,shortcut,new object[]{Path.GetDirectoryName(target)});
            shortcut.GetType().InvokeMember("Save",BindingFlags.InvokeMethod,null,shortcut,null);
        }finally{if(shortcut!=null)Marshal.FinalReleaseComObject(shortcut);Marshal.FinalReleaseComObject(shell);}
    }
    private static void RemoveOwnedFiles(string root)
    {
        foreach(string name in new[]{"VWO-Church-Office.exe","desktop-config.json","Uninstall.exe","README.txt"}){string path=Path.Combine(root,name);if(File.Exists(path))File.Delete(path);}
        // Do not recursively delete a directory: preserve anything the user added.
        if(Directory.Exists(root)&&Directory.GetFileSystemEntries(root).Length==0)Directory.Delete(root,false);
    }
    private static void Uninstall()
    {
        // The uninstall target is fixed for the current user, never supplied in arguments.
        if(InstallRoot!=Path.GetFullPath(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"VWOChurchOffice")))throw new Exception("Invalid installation path.");
        RemoveOwnedFiles(InstallRoot);
        foreach(string name in new[]{Product+".lnk","Connection settings.lnk"}){string path=Path.Combine(MenuRoot,name);if(File.Exists(path))File.Delete(path);}
        if(Directory.Exists(MenuRoot)&&Directory.GetFileSystemEntries(MenuRoot).Length==0)Directory.Delete(MenuRoot,false);
        if(File.Exists(DesktopLink))File.Delete(DesktopLink);
        Registry.CurrentUser.DeleteSubKeyTree(RegistryPath,false);
        MessageBox.Show("VWO Church Office has been removed. Your online church records were not changed.",Product);
    }
    private static void SelfTest()
    {
        string testRoot=Path.GetFullPath(Path.Combine(Environment.CurrentDirectory,"test-results","desktop-install"));
        string expectedParent=Path.GetFullPath(Path.Combine(Environment.CurrentDirectory,"test-results"))+Path.DirectorySeparatorChar;
        if(!testRoot.StartsWith(expectedParent,StringComparison.OrdinalIgnoreCase))throw new Exception("Invalid test directory.");
        string origin=ValidateOrigin("http://localhost:3000");
        InstallFiles(testRoot,origin);
        if(!File.Exists(Path.Combine(testRoot,"VWO-Church-Office.exe")))throw new Exception("Launcher not installed.");
        var config=new JavaScriptSerializer().Deserialize<Dictionary<string,string>>(File.ReadAllText(Path.Combine(testRoot,"desktop-config.json")));
        if(config["server_url"]!=origin)throw new Exception("Configuration mismatch.");
        Shortcut(Path.Combine(testRoot,"Test shortcut.lnk"),Path.Combine(testRoot,"VWO-Church-Office.exe"),"--configure");
        if(!File.Exists(Path.Combine(testRoot,"Test shortcut.lnk")))throw new Exception("Shortcut not created.");
        File.Delete(Path.Combine(testRoot,"Test shortcut.lnk"));
        InstallFiles(testRoot,"https://church.example.org");
        File.WriteAllText(Path.Combine(testRoot,"user-file.txt"),"This must survive uninstall.");
        RemoveOwnedFiles(testRoot);
        if(File.Exists(Path.Combine(testRoot,"VWO-Church-Office.exe"))||!File.Exists(Path.Combine(testRoot,"user-file.txt")))throw new Exception("Uninstall verification failed.");
        File.WriteAllText(Path.Combine(Environment.CurrentDirectory,"test-results","installer-result.txt"),"PASS: payload installation, server configuration, shortcut creation, update, and owned-file removal. User files preserved. No real Start-menu or uninstall registry entries modified.");
    }
}
