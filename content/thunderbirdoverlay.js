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
 * The Initial Developer of the Original Code is Moniker Pty Ltd.
 *
 * Portions created by Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 * 
 * Contributor(s): Leni Mayo
 * 
 * ***** END LICENSE BLOCK *****/

include("chrome://zindus/content/logger.js");
include("chrome://zindus/content/filesystem.js");
include("chrome://zindus/content/maestro.js");
include("chrome://zindus/content/timer.js");

window.addEventListener("load", onLoad, false);

function onLoad(event)
{
	var logger = newZinLogger("thunderbirdoverlay");

	try
	{
		newZinLogger().info("startup: " + APP_NAME + " " + APP_VERSION_NUMBER + " " + getUTCAndLocalTime());

		// We dont want to do this each time a new window is opened
		var messengerWindow = document.getElementById("messengerWindow");

		if (messengerWindow)
		{
			logger.debug("in messengerWindow");

			Filesystem.createDirectoriesIfRequired();

			var maestro = new ZinMaestro();

			if (!maestro.osIsRegistered())
			{
				logger.debug("creating ZinMaestro and registering it with nsIObserverService");

				maestro.osRegister();

				var preferences = new MozillaPreferences();

				if (preferences.getCharPrefOrNull(preferences.branch(), "general.manualsynconly") != "true")
				{
					var delay_on_repeat = parseInt(preferences.getIntPref(preferences.branch(), "system.timerDelay"));
					var delay_on_start  = Math.floor(Math.random() * (delay_on_repeat + 1)); // randomise clients to avoid hammering server

					logger.debug("starting timer: delay_on_start:" + delay_on_start +
					                                                " delay_on_repeat: " + delay_on_repeat);

					var functor = new ZinTimerFunctorSync(ZinMaestro.ID_FUNCTOR_TIMER_OVERLAY, delay_on_repeat);
					var timer = new ZinTimer(functor);
					timer.start(delay_on_start);
				}
				else
					logger.debug("not starting timer.");
			}
		}
	}
	catch (ex)
	{
		alert(APP_NAME + " thunderbirdoverlay onLoad() : " + ex);
	}
}

function zindusPrefsDialog()
{
	window.openDialog("chrome://zindus/content/prefsdialog.xul", "_blank", "chrome,modal,centerscreen");

	return true;
}
