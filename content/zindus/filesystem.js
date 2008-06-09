/* ***** BEGIN LICENSE BLOCK *****
 * 
 * "The contents of this file are subject to the Mozilla Public License
 * Version 1.1 (the "License"); you may not use this file except in
 * compliance with the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 * 
 * Software distributed under the License is distributed on an "AS IS"
 * basis, WITHOUT WARRANTY OF ANY KIND, either express or implied. See the
 * License for the specific language governing rights and limitations
 * under the License.
 * 
 * The Original Code is Zindus Sync.
 * 
 * The Initial Developer of the Original Code is Toolware Pty Ltd.
 *
 * Portions created by Initial Developer are Copyright (C) 2007-2008
 * the Initial Developer. All Rights Reserved.
 * 
 * Contributor(s): Leni Mayo
 * 
 * ***** END LICENSE BLOCK *****/

Filesystem.DIRECTORY_PROFILE = "profile";  // C:\Documents and Settings\user\Application Data\Thunderbird\Profiles\blah
Filesystem.DIRECTORY_APP     = APP_NAME;   //                                                                      blah\zindus
Filesystem.DIRECTORY_LOG     = "log";      //                                                                      blah\zindus\log
Filesystem.DIRECTORY_DATA    = "data";     //                                                                      blah\zindus\data

Filesystem.FILENAME_LOGFILE  = "logfile.txt";
Filesystem.FILENAME_LASTSYNC = "lastsync.txt";
Filesystem.FILENAME_GID      = "gid.txt";
Filesystem.FILENAME_STATUS   = "status.txt";

Filesystem.aDirectory = new Object();

// from prio.h
Filesystem.PERM_PR_IRUSR  = 0400;  // Read  by owner
Filesystem.PERM_PR_IWUSR  = 0200;  // Write by owner
Filesystem.PERM_PR_IXUSR  = 0100;  // Write by owner
Filesystem.PERM_PR_IRWXU  = 0700;  // R/W/X by owner

Filesystem.FLAG_PR_RDONLY      = 0x01;
Filesystem.FLAG_PR_WRONLY      = 0x02;
Filesystem.FLAG_PR_CREATE_FILE = 0x08;
Filesystem.FLAG_PR_APPEND      = 0x10;
Filesystem.FLAG_PR_TRUNCATE    = 0x20;
Filesystem.FLAG_PR_SYNC        = 0x40;

function Filesystem()
{
}

Filesystem.getDirectory = function(code)
{
	var nsifile;

	if (!ZinUtil.isPropertyPresent(Filesystem.aDirectory, code))
		switch(code)
		{
			case Filesystem.DIRECTORY_PROFILE:
				// http://developer.mozilla.org/en/docs/Code_snippets:File_I/O
				Filesystem.aDirectory[code] = Components.classes["@mozilla.org/file/directory_service;1"]
				                                  .getService(Components.interfaces.nsIProperties)
				                                  .get("ProfD", Components.interfaces.nsIFile);
				Filesystem.aDirectory[code].clone();
				break;

			case Filesystem.DIRECTORY_APP:
				Filesystem.aDirectory[code] = Filesystem.getDirectory(Filesystem.DIRECTORY_PROFILE);
				Filesystem.aDirectory[code].append(code);
				break;

		case Filesystem.DIRECTORY_LOG:
				Filesystem.aDirectory[code] = Filesystem.getDirectory(Filesystem.DIRECTORY_APP);
				Filesystem.aDirectory[code].append(code);
				break;

		case Filesystem.DIRECTORY_DATA:
				Filesystem.aDirectory[code] = Filesystem.getDirectory(Filesystem.DIRECTORY_APP);
				Filesystem.aDirectory[code].append(code);
				break;

		default:
			ZinUtil.assert(false);
			break;
	}

	var ret = Filesystem.aDirectory[code].clone();

	return ret;
}

Filesystem.createDirectoryIfRequired = function(code)
{
	var nsifile = Filesystem.getDirectory(code);

	if (!nsifile.exists() || !nsifile.isDirectory()) 
		try {
			nsifile.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, Filesystem.PERM_PR_IRWXU);
		}
		catch (e) {
			var msg1 = ZinUtil.stringBundleString("errorFilesystemCreateDirectoryFailed");
			var msg2 = ZinUtil.stringBundleString("errorFilesystemCreateDirectoryFailedSuggest");
			alert(msg1 + "\n" + nsifile.path + "\n" + msg2 + "\n" + e);
			// alert("Unable to create directory:\n  " + nsifile.path + "\nSuggest checking file/directory permissions.\nException: " + e);
		}
}

Filesystem.createDirectoriesIfRequired = function()
{
	Filesystem.createDirectoryIfRequired(Filesystem.DIRECTORY_APP);
	Filesystem.createDirectoryIfRequired(Filesystem.DIRECTORY_LOG);
	Filesystem.createDirectoryIfRequired(Filesystem.DIRECTORY_DATA);
}

Filesystem.writeToFile = function(file, content) 
{
	var retval = false;

	try 
	{
		if (!file.exists()) 
			file.create(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, Filesystem.PERM_PR_IRUSR | Filesystem.PERM_PR_IWUSR);

		// Write with nsIFileOutputStream.
		var outputStream = Components.classes["@mozilla.org/network/file-output-stream;1"].
		                              createInstance(Components.interfaces.nsIFileOutputStream);

		outputStream.init(file, Filesystem.FLAG_PR_WRONLY | Filesystem.FLAG_PR_TRUNCATE,
		                        Filesystem.PERM_PR_IRUSR | Filesystem.PERM_PR_IWUSR, null);
		outputStream.write(content, content.length);
		outputStream.flush();
		outputStream.close();

		retval = true;
	}
	catch (e) 
	{
		alert(e);
	}

	return retval;
}

Filesystem.fileReadByLine = function(path, functor)
{
	var file = Components.classes["@mozilla.org/file/local;1"].
	                      createInstance(Components.interfaces.nsILocalFile);

	file.initWithPath(path);

	if (file.exists())
	{
		var istream = Components.classes["@mozilla.org/network/file-input-stream;1"].
		                         createInstance(Components.interfaces.nsIFileInputStream);

		istream.init(file, Filesystem.FLAG_PR_RDONLY,  Filesystem.PERM_PR_IRUSR, 0);
		istream.QueryInterface(Components.interfaces.nsILineInputStream);

		var line = {};

		while (istream.readLine(line))
		{
			functor.run(line.value); 
			line.value = null;
		} 

		ZinUtil.assert(!line.value); // just to confirm my understanding of the way the loop works

		istream.close();
	} 
}
