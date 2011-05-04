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
 * Portions created by Initial Developer are Copyright (C) 2007-2009
 * the Initial Developer. All Rights Reserved.
 * 
 * Contributor(s): Leni Mayo
 * 
 * ***** END LICENSE BLOCK *****/
// $Id: const.js,v 1.305 2011-05-04 22:41:14 cvsuser Exp $

const APP_NAME="zindus";
const APP_VERSION_NUMBER="0.8.31.20110505.084055";                      // this line generated by build.sh
const APP_VERSION_DATA_CONSISTENT_WITH="0.8.30.20110426.154117";        // remove the data files (forcing a slow sync) if data was
                                                                        // generated by a software version older than this

const ZM_ID_FOLDER_TRASH         = 3;             // For the ZM_* constants, see: ZimbraServer/src/java/com/zimbra/cs/mailbox/Mailbox.java
const ZM_ID_FOLDER_CONTACTS      = 7;
const ZM_ID_FOLDER_AUTO_CONTACTS = 13;

const ZM_FOLDER_CONTACTS         = "Contacts";
const ZM_FOLDER_EMAILED_CONTACTS = "Emailed Contacts";

const ZM_PERM_NONE     = 0x00;
const ZM_PERM_READ     = 0x01;
const ZM_PERM_WRITE    = 0x02;

const TBCARD_ATTRIBUTE_LUID       = "zindus-id";    // user-defined attributes associated with thunderbird cards
const TBCARD_ATTRIBUTE_CHECKSUM   = "zindus-cs";
const TBCARD_ATTRIBUTE_EXPIRED_ON = "zindus-expired-on";
const TBCARD_ATTRIBUTE_LUID_ITER  = "zindus-id-iter"; // used to identify cards in mailing lists
const TBCARD_CHECKSUM_BACKWARDS   = -112233;

const GD_API_VERSION           = '3-new-fields-only'; // 2 or 3-new-fields-only
const GD_PAB                   = "zindus_pab_gd";
const GD_GR_AS_AB_SEPARATOR    = '#';

const TB_PAB                   = "zindus_pab";
const TB_EMAILED_CONTACTS      = "zindus_emailed_contacts";
const TB_PAB_FULLNAME          = "Personal Address Book";
const TB_GOOGLE_CONFLICT_TRASH = "ToBeDeleted";
const TB_PHOTO_PROPERTIES      = { "PhotoName":0, "PhotoType":0, "PhotoURI":0 };
const TB_PHOTO_TYPES           = { "file":0, "web":0 };

const SOURCEID_TB = 1;
const SOURCEID_AA = 2;

const FORMAT_TB = 1;
const FORMAT_ZM = 2;
const FORMAT_GD = 3;
const FORMAT_LD = 4;

const A_VALID_FORMATS = [ FORMAT_TB, FORMAT_ZM, FORMAT_GD ]; // FORMAT_LD

const MAX_BATCH_SIZE = 50;   // max number of contacts that the addon will POST/GET to/from server in one request
const MAX_SYNC_START = 3;    // max number of times an account can be synced in a chain (1 ==> rule viol, 2 ==> group_mod, 3 ==> done)

const CER_TO_CHAR    = 0x01; // convert Character Entity References (eg &lt;) into characters (eg <)
const CER_TO_ENTITY  = 0x02; // convert Characters into Character Entity References

const Cc = Components.classes;
const Ci = Components.interfaces;

// See RFC 2821 and http://en.wikipedia.org/wiki/E-mail_address
// Thank goodness Gmail doesn't support email addresses where the local-part is a quoted string :-)
//
const re_valid_email     = /^([A-Z0-9\.\!\#\$\%\*\/\?\|\^\{\}\`\~\&\'\+\_\-\=]+@[A-Z0-9.-]+\.[A-Z]+)$/i;
const re_xml_declaration = /\<\?xml version=.*?\?\>/;        // e4x bug: https://bugzilla.mozilla.org/show_bug.cgi?id=336551

// http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html
//
const HTTP_STATUS_200_OK             = 200;
const HTTP_STATUS_201_CREATED        = 201;
const HTTP_STATUS_401_UNAUTHORIZED   = 401;
const HTTP_STATUS_403_FORBIDDEN      = 403;
const HTTP_STATUS_404_NOT_FOUND      = 404;
const HTTP_STATUS_409_CONFLICT       = 409;
const HTTP_STATUS_ON_SERVICE_FAILURE = -12345;
const HTTP_STATUS_ON_CANCEL          = -12346;
const HTTP_STATUS_2xx                = [ 200, 299 ];     // Successful
const HTTP_STATUS_4xx                = [ 400, 499 ];     // Client error
const HTTP_STATUS_5xx                = [ 500, 599 ];     // Server error
