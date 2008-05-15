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

include("chrome://zindus/content/utils.js");

function SyncFsmExitStatus()
{
	this.m_exit_status      = null;
	this.m_fail_code        = null; // one of the Fail* codes
	this.m_fail_detail      = null;
	this.m_fail_soapmethod  = null;
	this.m_fail_fsmoldstate = null;
	this.m_count_conflicts  = 0;
	this.m_logger           = newZinLogger("SyncFsmExitStatus");

	this.m_a_valid_code = {
		FailOnService                   : { 'hasdetail' : 0 }, // 1.  some sort of service failure
		FailOnFault                     : { 'hasdetail' : 0 }, // 2.  recieved a soap fault
		FailOnMismatchedResponse        : { 'hasdetail' : 0 }, // 3.  sent BlahRequest and received FooResponse (expected BlahResponse)
		FailOnCancel                    : { 'hasdetail' : 0 }, // 4.  user cancelled
		FailOnIntegrityBadCredentialsZm : { 'hasdetail' : 0 }, // 5.  something dodgy about url, username or password - dont proceed
		FailOnIntegrityBadCredentialsGd : { 'hasdetail' : 0 }, // 6.  something dodgy about email address or password - dont proceed
		FailOnIntegrityDataStoreIn      : { 'hasdetail' : 0 }, // 7.  something dodgy about the data store that just got loaded
		FailOnIntegrityDataStoreOut     : { 'hasdetail' : 0 }, // 8.  internal error - we've created a data store that's dodgy
		FailOnUnknown                   : { 'hasdetail' : 0 }, // 9.  this should never be!
		FailOnFolderNameDuplicate       : { 'hasdetail' : 1 }, // 10
		FailOnFolderNameReserved        : { 'hasdetail' : 1 }, // 11.
		FailOnFolderNameInvalid         : { 'hasdetail' : 1 }, // 12.
		FailOnFolderMustBePresent       : { 'hasdetail' : 1 }, // 13.
		FailOnFolderReservedChanged     : { 'hasdetail' : 1 }, // 14.
		FailOnFolderNameClash           : { 'hasdetail' : 1 }, // 15. the same folder name entered the namespace from both tb and zm sides
		FailOnFolderSourceUpdate        : { 'hasdetail' : 1 }, // 16. the source update operations can't be applied with confidence
		FailOnFolderCantCreateShared    : { 'hasdetail' : 1 }, // 17. 
		FailOnUnableToUpdateServer      : { 'hasdetail' : 1 }, // 18. couldn't make sense of the http/soap response
		FailOnNoXpath                   : { 'hasdetail' : 0 }, // 19. 
		FailOnNoPab                     : { 'hasdetail' : 0 }, // 20. 
		FailOnMultipleLn                : { 'hasdetail' : 1 }, // 21. 
		FailOnGdConflict1               : { 'hasdetail' : 1 }, // 22. 
		FailOnGdConflict2               : { 'hasdetail' : 1 }, // 23. 
		FailOnGdConflict3               : { 'hasdetail' : 1 }, // 24. 
		FailOnZmEmptyContact            : { 'hasdetail' : 1 }, // 25. 
		FailOnGdEmptyContact            : { 'hasdetail' : 1 }, // 26. 
		FailOnNoGdSyncWithZg            : { 'hasdetail' : 0 }, // 27. 
		FailOnUnauthorized              : { 'hasdetail' : 0 }, // 28. server returned 401 - perhaps a proxy removed the 'Authorized' header?
		FailOnAuthGd                    : { 'hasdetail' : 1 }  // 29. server returned a non 200 status code
	};
}

SyncFsmExitStatus.prototype.stringBundleString = stringBundleString;

SyncFsmExitStatus.prototype.toString = function()
{
	var ret = "";
	
	ret += "exit_status: " + this.m_exit_status;

	if (this.m_exit_status)
	{
		ret += " fail_code: "        + this.failcode();
		ret += " fail_detail: "      + this.m_fail_detail;
		ret += " fail_fsmoldstate: " + this.m_fail_fsmoldstate;
	}

	ret += " count_conflicts: " + this.m_count_conflicts;

	return ret;
}

SyncFsmExitStatus.prototype.failCodeStringId = function()
{
	var stringid = "status" + this.failcode();

	return stringid;
}

SyncFsmExitStatus.prototype.failcode = function()
{
	if (arguments.length == 1)
	{
		this.m_fail_code = arguments[0];
		zinAssertAndLog(isPropertyPresent(this.m_a_valid_code, this.m_fail_code), "unmatched code: " + this.m_fail_code);
	}

	return this.m_fail_code;
}

SyncFsmExitStatus.prototype.hasDetail = function()
{
	return this.m_a_valid_code[this.failcode()]['hasdetail'] == 1;
}

SyncFsmExitStatus.prototype.asMessage = function(sbsSuccess, sbsFailure)
{
	var msg = "";

	// if the dialog was cancelled while we were syncing, string bundles wont be available, so we try/catch...
	//
	try {
		if (this.m_exit_status == 0)
			msg += stringBundleString(sbsSuccess);
		else
		{
			msg += stringBundleString(sbsFailure);
			msg += "\n" + stringBundleString(this.failCodeStringId());

			if (this.failcode() == 'FailOnFault')
			{
				msg += "\n" + this.m_fail_detail;
				msg += "\n" + stringBundleString("statusFailSoapMethod") + " " + this.m_fail_soapmethod;
			}
			else if (this.failcode() == 'FailOnCancel')
				msg += "\n" + stringBundleString("statusFailOnCancelDetail");
			else if (this.failcode() == 'FailOnService')
				msg += "\n" + stringBundleString("statusFailOnServiceDetail");
			else if (this.hasDetail())
				msg += this.m_fail_detail;
		}
	} catch (ex) {
		dump("asMessage: exception: " + ex.message + "\n");
		this.m_logger.debug("asMessage: exception: " + ex.message);
	}

	return msg;
}
