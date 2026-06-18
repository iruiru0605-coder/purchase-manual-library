Set shell = CreateObject("WScript.Shell")
scriptPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\launch-windows.js"
command = "node.exe """ & scriptPath & """"
shell.Run command, 0, False
