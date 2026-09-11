using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Drawing;
using System.Reflection;
[assembly: AssemblyTitle("VWO Church Office")]
[assembly: AssemblyProduct("VWO Church Office")]
[assembly: AssemblyVersion("1.1.0.0")]
[assembly: AssemblyFileVersion("1.1.0.0")]

internal static class DesktopLauncher
{
    [STAThread]
    private static int Main(string[] args)
    {
        Application.EnableVisualStyles();
        try
        {
            string directory = AppDomain.CurrentDomain.BaseDirectory;
            string configPath = Path.Combine(directory, "desktop-config.json");
            if (Array.IndexOf(args, "--configure") >= 0) { Configure(configPath); return 0; }
            var json = new JavaScriptSerializer();
            var config = json.Deserialize<Dictionary<string, string>>(File.ReadAllText(configPath));
            string origin = (Environment.GetEnvironmentVariable("VWO_SERVER_URL") ?? config["server_url"]).TrimEnd('/');
            Uri server = new Uri(origin);
            bool local = server.Host == "localhost" || server.Host == "127.0.0.1";
            if (server.Scheme != "https" && !(server.Scheme == "http" && local))
                throw new Exception("The hosted church server must use HTTPS.");
            if (server.UserInfo != "" || server.Query != "" || server.Fragment != "" || server.AbsolutePath != "/")
                throw new Exception("Use only the server origin in desktop-config.json.");
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            var request = WebRequest.CreateHttp(origin + "/api/health");
            request.Timeout = 10000;
            using (var response = request.GetResponse())
            using (var stream = new StreamReader(response.GetResponseStream()))
            {
                var health = json.Deserialize<Dictionary<string, object>>(stream.ReadToEnd());
                if (!health.ContainsKey("ok") || !true.Equals(health["ok"]))
                    throw new Exception("The church server is not ready.");
            }
            string edge = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe");
            if (!File.Exists(edge)) edge = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe");
            if (!File.Exists(edge)) throw new Exception("Microsoft Edge is required to open the church office.");
            // Verification mode checks server/configuration without opening a window.
            if (Array.IndexOf(args, "--check") >= 0) return 0;
            Process.Start(new ProcessStartInfo(edge, "--app=\"" + origin + "/desktop\" --inprivate --no-first-run") { UseShellExecute = true });
            return 0;
        }
        catch (Exception error)
        {
            if (Array.IndexOf(args, "--check") < 0)
                MessageBox.Show("The church office requires a connection to the server. Check your internet connection and desktop-config.json, then reopen the app.\n\n" + error.Message, "VWO Church Office", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 1;
        }
    }
    private static void Configure(string configPath)
    {
        var form = new Form { Text = "VWO Church Office · Connection", ClientSize = new Size(500,230), FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false, StartPosition = FormStartPosition.CenterScreen, Font = new Font("Segoe UI",10) };
        var label = new Label { Text = "Church server address (HTTPS)", Location = new Point(25,25), AutoSize = true };
        var address = new TextBox { Location = new Point(25,58), Width = 450, Text = "https://" };
        try { address.Text = new JavaScriptSerializer().Deserialize<Dictionary<string,string>>(File.ReadAllText(configPath))["server_url"]; } catch {}
        var hint = new Label { Text = "Use the same hosted server on every church computer.\nLocal development only: http://localhost:3000", Location = new Point(25,100), Size = new Size(450,50) };
        var save = new Button { Text = "Save connection", Location = new Point(285,167), Size = new Size(190,38) };
        save.Click += delegate {
            try {
                string origin=address.Text.Trim().TrimEnd('/');Uri uri;
                if(!Uri.TryCreate(origin,UriKind.Absolute,out uri)||(uri.Scheme!="https"&&!(uri.Scheme=="http"&&(uri.Host=="localhost"||uri.Host=="127.0.0.1")))||uri.UserInfo!=""||uri.Query!=""||uri.Fragment!=""||uri.AbsolutePath!="/")throw new Exception("Enter only the HTTPS server origin. HTTP is allowed only for localhost.");
                File.WriteAllText(configPath,new JavaScriptSerializer().Serialize(new Dictionary<string,string>{{"server_url",origin}}));
                MessageBox.Show("Connection saved. Reopen the church office to connect.","VWO Church Office");form.Close();
            }catch(Exception error){MessageBox.Show(error.Message,"Connection settings",MessageBoxButtons.OK,MessageBoxIcon.Error);}
        };
        form.Controls.AddRange(new Control[]{label,address,hint,save});form.AcceptButton=save;Application.Run(form);
    }
}
