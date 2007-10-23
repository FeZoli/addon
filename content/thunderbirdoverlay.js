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

include("chrome://zindus/content/maestro.js");
include("chrome://zindus/content/timer.js");

window.addEventListener("load", onLoad, false);
window.addEventListener("unload", onUnLoad, false);

function onLoad(event)
{
	var logger = newZinLogger("thunderbirdoverlay");

	try
	{
		newZinLogger().info("startup: " + APP_NAME + " " + APP_VERSION_NUMBER + " " + getUTCAndLocalTime());

		var messengerWindow = document.getElementById("messengerWindow");

		if (messengerWindow)
		{
			logger.debug("in messengerWindow");

			Filesystem.createDirectoriesIfRequired();

			var maestro = new ZinMaestro();
			window.maestro = maestro;

			if (!ObserverService.isRegistered(maestro.TOPIC))
			{
				ObserverService.register(maestro, maestro.TOPIC);

				var prefs = new MozillaPreferences();

				if (prefs.getCharPrefOrNull(prefs.branch(), "general.manualsynconly") != "true")
				{
					// the first sync happens sometime in the second hour after startup (randomised to avoid hammering server)
					// subsequent firings also randomised
					// .toFixed(0) rounds to the nearest integer.
					//
					var delay_on_repeat, delay_on_start;

					delay_on_repeat = parseInt(prefs.getIntPref(prefs.branch(), "system.timerDelayOnRepeat"));
					delay_on_start  = parseInt(prefs.getIntPref(prefs.branch(), "system.timerDelayOnStart"));
					delay_on_start  = randomPlusOrMinus(delay_on_start, (1/2 * delay_on_start).toFixed(0));

					logger.debug("delay_on_start:" + delay_on_start + " delay_on_repeat: " + delay_on_repeat);

					var functor = new ZinTimerFunctorSync(ZinMaestro.ID_FUNCTOR_TIMER_OVERLAY,
					                                       [delay_on_repeat, (1/6 * delay_on_repeat).toFixed(0)]);
					var timer = new ZinTimer(functor);
					timer.start(delay_on_start);
				}
				else
					logger.debug("manual sync only - not starting timer.");
			}
			else
				logger.debug("ObserverService is already registered so don't reregister or start timer.");

			StatusPanel.update(window);
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

function onUnLoad(event)
{
	var logger = newZinLogger("thunderbirdoverlay");

	try
	{
		var messengerWindow = document.getElementById("messengerWindow");

		if (messengerWindow)
		{
			logger.debug("in messengerWindow - about to unload");

			if (ObserverService.isRegistered(window.maestro.TOPIC))
			{
				ObserverService.unregister(maestro, window.maestro.TOPIC);
			}
			else
				logger.debug("ObserverService isn't gistered so don't unregister.");
		}
	}
	catch (ex)
	{
		alert(APP_NAME + " thunderbirdoverlay onUnLoad() : " + ex);
	}
}
