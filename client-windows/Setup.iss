; TheiaCast Kiosk Client Installer Script for Inno Setup
;
; Build instructions:
; 1. Install Inno Setup from https://jrsoftware.org/isdl.php
; 2. Build the .NET project: dotnet publish KioskClient.Service -c Release -o publish -r win-x64 --self-contained false
; 3. Run Playwright install with bundled browsers:
;    cd publish
;    $env:PLAYWRIGHT_BROWSERS_PATH = "$PWD"
;    pwsh playwright.ps1 install chromium --with-deps
; 4. Compile this script with Inno Setup to create Setup.exe
; 5. Distribute Setup.exe
;
; Runtime Requirements:
; - .NET 10 Runtime (automatically downloaded and installed by this installer if missing)
; - Windows 10 or later
;
; Installation with parameters:
;   Setup.exe /VERYSILENT /ServerUrl=http://server:5001 /DeviceId=office-kiosk /DeviceToken=abc123
;
; Installation with GUI:
;   Setup.exe (will prompt for parameters and install .NET 10 if needed)

#define MyAppName "TheiaCast Kiosk Client"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "TheiaCast"
#define MyAppURL "https://github.com/jimmyeao/TheiaCast"
#define MyAppExeName "KioskClient.Service.exe"
#define MyServiceName "TheiaCastKioskClient"

[Setup]
AppId={{B8E9F1A2-3C4D-5E6F-7A8B-9C0D1E2F3A4B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\TheiaCast\KioskClient
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=.
OutputBaseFilename=TheiaCastKioskClient-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
UninstallDisplayIcon={app}\icon.ico
SetupIconFile=icon.ico
DisableWelcomePage=no
DisableDirPage=no
DisableFinishedPage=no
DisableReadyPage=no
ArchitecturesInstallIn64BitMode=x64
ArchitecturesAllowed=x64
[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Types]
Name: "full"; Description: "Full installation"

[Components]
Name: "main"; Description: "Core files"; Types: full; Flags: fixed

[Files]
Source: "publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "icon.ico"; DestDir: "{app}"; Flags: ignoreversion
; NOTE: Don't use "Flags: ignoreversion" on any shared system files

[Code]
var
  ServerUrlPage: TInputQueryWizardPage;
  DeviceIdPage: TInputQueryWizardPage;
  DeviceTokenPage: TInputQueryWizardPage;
  ServerUrl, DeviceId, DeviceToken: String;
  DotNetInstallNeeded: Boolean;

function IsDotNet10Installed(): Boolean;
var
  VersionString: String;
  FindRec: TFindRec;
  DotNetPath: String;
  MajorVersion: Integer;
  DotPos: Integer;
begin
  Result := False;

  // Check the FXR directory first (most reliable method)
  // The registry only shows the LAST installed .NET version, not all versions
  DotNetPath := ExpandConstant('{commonpf}\dotnet\host\fxr');
  if DirExists(DotNetPath) then
  begin
    if FindFirst(DotNetPath + '\10.*', FindRec) then
    begin
      try
        repeat
          if FindRec.Attributes and FILE_ATTRIBUTE_DIRECTORY <> 0 then
          begin
            Result := True;
            Exit;
          end;
        until not FindNext(FindRec);
      finally
        FindClose(FindRec);
      end;
    end;
  end;

  // Also check the runtime folder directly for any 10.x version
  DotNetPath := ExpandConstant('{commonpf}\dotnet\shared\Microsoft.NETCore.App');
  if DirExists(DotNetPath) then
  begin
    if FindFirst(DotNetPath + '\10.*', FindRec) then
    begin
      try
        repeat
          if FindRec.Attributes and FILE_ATTRIBUTE_DIRECTORY <> 0 then
          begin
            Result := True;
            Exit;
          end;
        until not FindNext(FindRec);
      finally
        FindClose(FindRec);
      end;
    end;
  end;

end;
function DownloadAndInstallDotNet(): Boolean;
var
  ResultCode: Integer;
  DotNetInstallerPath: String;
  DownloadPage: TDownloadWizardPage;
begin
  Result := True;
  DotNetInstallerPath := ExpandConstant('{tmp}\dotnet-runtime-installer.exe');

  // Create download page
  DownloadPage := CreateDownloadPage('Downloading .NET Runtime', 'Downloading required .NET 10 Runtime...', nil);
  DownloadPage.Clear;

  // Add .NET 10 Desktop Runtime (includes ASP.NET Core)
  // NOTE: If this URL becomes outdated, get the latest download URL from:
  // https://dotnet.microsoft.com/download/dotnet/10.0
  // Look for "Windows Desktop Runtime x64" direct download link
  DownloadPage.Add('https://builds.dotnet.microsoft.com/dotnet/Runtime/10.0.1/dotnet-runtime-10.0.1-win-x64.exe',
                   'dotnet-runtime-installer.exe', '');

  try
    DownloadPage.Show;
    try
      DownloadPage.Download;
      Result := True;
    except
      MsgBox('Failed to download .NET 10 Runtime. Please download and install it manually from:' + #13#10 +
             'https://dotnet.microsoft.com/download/dotnet/10.0' + #13#10 + #13#10 +
             'Then run this installer again.', mbError, MB_OK);
      Result := False;
      Exit;
    finally
      DownloadPage.Hide;
    end;
  finally
    DownloadPage.Free;
  end;

  if Result then
  begin
    // Install .NET Runtime silently
    if not Exec(DotNetInstallerPath, '/install /quiet /norestart', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    begin
      MsgBox('Failed to execute .NET installer. Please install .NET 10 Runtime manually.', mbError, MB_OK);
      Result := False;
    end
    else if ResultCode <> 0 then
    begin
      MsgBox('Failed to install .NET 10 Runtime. Error code: ' + IntToStr(ResultCode) + #13#10 +
             'Please install it manually from: https://dotnet.microsoft.com/download/dotnet/10.0', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

function GetActualLoggedInUser(): String;
var
  ResultCode: Integer;
  TempFile: String;
  TempScript: String;
  UserInfo: AnsiString;
begin
  // Detect the actual logged-in user (not the elevated installer user)
  // We use PowerShell to find the owner of explorer.exe
  Result := '';
  TempFile := ExpandConstant('{tmp}\currentuser.txt');
  TempScript := ExpandConstant('{tmp}\getuser.ps1');

  // Create a PowerShell script file (easier than escaping quotes)
  SaveStringToFile(TempScript,
    '$p = Get-WmiObject Win32_Process -Filter "name=''explorer.exe''" | Select-Object -First 1; ' +
    'if ($p) { $o = $p.GetOwner(); "{0}\{1}" -f $o.Domain,$o.User | Out-File -FilePath "' + TempFile + '" -Encoding ASCII }',
    False);

  // Execute the script
  if Exec('powershell.exe',
    '-NoProfile -ExecutionPolicy Bypass -File "' + TempScript + '"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if FileExists(TempFile) then
    begin
      if LoadStringFromFile(TempFile, UserInfo) then
      begin
        Result := Trim(String(UserInfo));
      end;
      DeleteFile(TempFile);
    end;
    DeleteFile(TempScript);
  end;

  // Fallback to current user if detection fails
  if Result = '' then
    Result := GetUserNameString;
end;

function ReadExistingConfig(const Key: String): String;
var
  ConfigFile: String;
  ConfigContent: AnsiString;
  StartPos, EndPos: Integer;
  SearchKey: String;
  PreviousInstallPath: String;
begin
  Result := '';

  // First, try to get the previous installation path from registry
  if RegQueryStringValue(HKLM, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{B8E9F1A2-3C4D-5E6F-7A8B-9C0D1E2F3A4B}_is1',
                          'InstallLocation', PreviousInstallPath) then
  begin
    // Registry found, try reading from previous install location
    ConfigFile := AddBackslash(PreviousInstallPath) + 'appsettings.json';
    Log('Checking for existing config at registry location: ' + ConfigFile);
  end
  else
  begin
    // Fallback to default location if registry not found
    // Use {autopf} instead of {app} since {app} isn't available during InitializeWizard
    ConfigFile := ExpandConstant('{autopf}\TheiaCast\KioskClient\appsettings.json');
    Log('Checking for existing config at default location: ' + ConfigFile);
  end;

  if FileExists(ConfigFile) then
  begin
    Log('Found existing config file: ' + ConfigFile);
    if LoadStringFromFile(ConfigFile, ConfigContent) then
    begin
      // Simple JSON parsing - look for "Key": "Value"
      SearchKey := '"' + Key + '": "';
      StartPos := Pos(SearchKey, String(ConfigContent));
      if StartPos > 0 then
      begin
        StartPos := StartPos + Length(SearchKey);
        EndPos := StartPos;
        while (EndPos <= Length(ConfigContent)) and (ConfigContent[EndPos] <> '"') do
          EndPos := EndPos + 1;
        Result := Copy(String(ConfigContent), StartPos, EndPos - StartPos);
        Log('Read ' + Key + ' from config: ' + Result);
      end
      else
      begin
        Log('Key "' + Key + '" not found in config file');
      end;
    end
    else
    begin
      Log('Failed to load config file');
    end;
  end
  else
  begin
    Log('Config file does not exist: ' + ConfigFile);
  end;
end;

procedure InitializeWizard;
var
  ExistingServerUrl, ExistingDeviceId, ExistingDeviceToken: String;
begin
  // Check if .NET 10 is installed
  DotNetInstallNeeded := not IsDotNet10Installed();

  if DotNetInstallNeeded then
  begin
    MsgBox('.NET 10 Runtime is required but not installed.' + #13#10 +
           'The installer will download and install it automatically.', mbInformation, MB_OK);
  end;

  // Check for command-line parameters first
  ServerUrl := ExpandConstant('{param:ServerUrl|}');
  DeviceId := ExpandConstant('{param:DeviceId|}');
  DeviceToken := ExpandConstant('{param:DeviceToken|}');

  // Try to read existing config if not provided via command line
  if ServerUrl = '' then
    ExistingServerUrl := ReadExistingConfig('ServerUrl')
  else
    ExistingServerUrl := ServerUrl;

  if DeviceId = '' then
    ExistingDeviceId := ReadExistingConfig('DeviceId')
  else
    ExistingDeviceId := DeviceId;

  if DeviceToken = '' then
    ExistingDeviceToken := ReadExistingConfig('DeviceToken')
  else
    ExistingDeviceToken := DeviceToken;

  // Only show pages if parameters not provided via command line
  if (ServerUrl = '') or (DeviceId = '') or (DeviceToken = '') then
  begin
    // Server URL page
    ServerUrlPage := CreateInputQueryPage(wpWelcome,
      'Server Configuration', 'Enter TheiaCast Server URL',
      'Please enter the URL of your TheiaCast server (e.g., http://192.168.0.57:5001)');
    ServerUrlPage.Add('Server URL:', False);
    if ExistingServerUrl <> '' then
      ServerUrlPage.Values[0] := ExistingServerUrl
    else
      ServerUrlPage.Values[0] := 'http://';

    // Device ID page
    DeviceIdPage := CreateInputQueryPage(ServerUrlPage.ID,
      'Device Configuration', 'Enter Device ID',
      'Please enter a unique identifier for this device (e.g., office-kiosk-1)');
    DeviceIdPage.Add('Device ID:', False);
    if ExistingDeviceId <> '' then
      DeviceIdPage.Values[0] := ExistingDeviceId
    else
      DeviceIdPage.Values[0] := GetComputerNameString;

    // Device Token page
    DeviceTokenPage := CreateInputQueryPage(DeviceIdPage.ID,
      'Device Authentication', 'Enter Device Token',
      'Please enter the device token from the TheiaCast admin interface.' + #13#10 +
      'To obtain a token:' + #13#10 +
      '1. Log into the TheiaCast admin UI' + #13#10 +
      '2. Go to Devices page' + #13#10 +
      '3. Create or select your device' + #13#10 +
      '4. Copy the Device Token');
    DeviceTokenPage.Add('Device Token:', False);
    if ExistingDeviceToken <> '' then
      DeviceTokenPage.Values[0] := ExistingDeviceToken;
  end
  else
  begin
    // If all parameters provided via command line or existing config, use them
    if ServerUrl = '' then ServerUrl := ExistingServerUrl;
    if DeviceId = '' then DeviceId := ExistingDeviceId;
    if DeviceToken = '' then DeviceToken := ExistingDeviceToken;
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;

  // Validate Server URL page
  if CurPageID = ServerUrlPage.ID then  // Remove the ServerUrl = '' check
  begin
    ServerUrl := Trim(ServerUrlPage.Values[0]);
    if ServerUrl = '' then
    begin
      MsgBox('Please enter a server URL.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if (Pos('http://', ServerUrl) <> 1) and (Pos('https://', ServerUrl) <> 1) then
    begin
      MsgBox('Server URL must start with http:// or https://', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    // Check that URL has content after the protocol
    if (ServerUrl = 'http://') or (ServerUrl = 'https://') then
    begin
      MsgBox('Please enter a complete server URL (e.g., http://192.168.0.57:5001)', mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;

  // Validate Device ID page
  if CurPageID = DeviceIdPage.ID then  // Remove the DeviceId = '' check
  begin
    DeviceId := Trim(DeviceIdPage.Values[0]);
    if DeviceId = '' then
    begin
      MsgBox('Please enter a device ID.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;

  // Validate Device Token page
  if CurPageID = DeviceTokenPage.ID then  // Remove the DeviceToken = '' check
  begin
    DeviceToken := Trim(DeviceTokenPage.Values[0]);
    if DeviceToken = '' then
    begin
      MsgBox('Please enter a device token.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  NeedsRestart := False;

  // Install .NET 10 if needed
  if DotNetInstallNeeded then
  begin
    if not DownloadAndInstallDotNet() then
    begin
      Result := 'Failed to install .NET 10 Runtime. Please install it manually and run the installer again.';
      Exit;
    end;

    // Check again if .NET was successfully installed
    if not IsDotNet10Installed() then
    begin
      Result := '.NET 10 Runtime installation failed. Please install it manually from https://dotnet.microsoft.com/download/dotnet/10.0';
      Exit;
    end;

    DotNetInstallNeeded := False;
  end;
end;

procedure StopAndRemoveService;
var
  ResultCode: Integer;
begin
  // Stop service if running
  Exec('sc.exe', 'stop {#MyServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(2000);

  // Remove service if exists
  Exec('sc.exe', 'delete {#MyServiceName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(2000);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ConfigFile: String;
  ConfigContent: String;
  ResultCode: Integer;
  ServiceExePath: String;
  ScCommand: String;
begin
  if CurStep = ssInstall then
  begin
    // Stop and remove existing service before installation
    StopAndRemoveService;
  end;

  if CurStep = ssPostInstall then
  begin
    // Get final values (from pages or command line)
    if ServerUrl = '' then
      ServerUrl := Trim(ServerUrlPage.Values[0]);
    if DeviceId = '' then
      DeviceId := Trim(DeviceIdPage.Values[0]);
    if DeviceToken = '' then
      DeviceToken := Trim(DeviceTokenPage.Values[0]);

    // Create appsettings.json
    ConfigFile := ExpandConstant('{app}\appsettings.json');
    ConfigContent := '{' + #13#10 +
      '  "Logging": {' + #13#10 +
      '    "LogLevel": {' + #13#10 +
      '      "Default": "Information",' + #13#10 +
      '      "Microsoft.Hosting.Lifetime": "Information"' + #13#10 +
      '    }' + #13#10 +
      '  },' + #13#10 +
      '  "Kiosk": {' + #13#10 +
      '    "ServerUrl": "' + ServerUrl + '",' + #13#10 +
      '    "DeviceId": "' + DeviceId + '",' + #13#10 +
      '    "DeviceToken": "' + DeviceToken + '",' + #13#10 +
      '    "HealthReportIntervalMs": 60000,' + #13#10 +
      '    "ScreenshotIntervalMs": 300000,' + #13#10 +
      '    "Headless": false,' + #13#10 +
      '    "KioskMode": false,' + #13#10 +
      '    "ViewportWidth": 1920,' + #13#10 +
      '    "ViewportHeight": 1080' + #13#10 +
      '  }' + #13#10 +
      '}';

    SaveStringToFile(ConfigFile, ConfigContent, False);

    // Set PLAYWRIGHT_BROWSERS_PATH environment variable so Playwright can find bundled browsers
    // This tells Playwright to look in the app's ms-playwright folder instead of user's AppData
    RegWriteStringValue(HKLM, 'SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
      'PLAYWRIGHT_BROWSERS_PATH', ExpandConstant('{app}'));

    // Create browser profile directory with proper permissions
    // This prevents "Profile error occurred" when running as scheduled task
    ScCommand := ExpandConstant('{commonappdata}\TheiaCast\browser-profile');
    if not DirExists(ScCommand) then
      CreateDir(ScCommand);

    // Grant full control to Users group using icacls
    Exec('icacls.exe', '"' + ScCommand + '" /grant Users:(OI)(CI)F /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    // Detect the actual logged-in user (not the elevated installer user)
    ScCommand := GetActualLoggedInUser();

    // Create Scheduled Task to auto-start on user login (instead of Windows Service)
    // This allows the browser UI to be visible since it runs in the user's interactive session
    ServiceExePath := ExpandConstant('{app}\{#MyAppExeName}');

    // Delete existing task if it exists
    Exec('schtasks.exe', '/Delete /TN "TheiaCastKioskClient-AutoStart" /F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    // Create scheduled task that runs at logon with highest privileges
    // Using the actual logged-in user, not the installer/elevated user
    ScCommand := '/Create /TN "TheiaCastKioskClient-AutoStart" ' +
                 '/TR "\"' + ServiceExePath + '\"" ' +
                 '/SC ONLOGON ' +
                 '/RL HIGHEST ' +
                 '/F ' +
                 '/RU "' + ScCommand + '" ' +
                 '/IT';

    if Exec('schtasks.exe', ScCommand, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    begin
      if ResultCode = 0 then
      begin
        // Try to start the task immediately
        Exec('schtasks.exe', '/Run /TN "TheiaCastKioskClient-AutoStart"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
        MsgBox('Installation complete!' + #13#10 + #13#10 +
               'The Kiosk Client will start automatically when you log in.' + #13#10 + #13#10 +
               'The browser window should now be visible.', mbInformation, MB_OK);
      end
      else
        MsgBox('Failed to create scheduled task. Error code: ' + IntToStr(ResultCode), mbError, MB_OK);
    end
    else
    begin
      MsgBox('Failed to execute schtasks.exe', mbError, MB_OK);
    end;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
begin
  if CurUninstallStep = usUninstall then
  begin
    // Stop and remove the Windows Service (for upgrades from old versions)
    StopAndRemoveService;

    // Remove scheduled task
    Exec('schtasks.exe', '/Delete /TN "TheiaCastKioskClient-AutoStart" /F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

    // Remove PLAYWRIGHT_BROWSERS_PATH environment variable
    RegDeleteValue(HKLM, 'SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
      'PLAYWRIGHT_BROWSERS_PATH');
  end;
end;

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Icons]
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"

; NOTE: Playwright browsers are pre-installed during the build process (BuildInstaller.ps1)
; No need to run playwright.ps1 during installation
