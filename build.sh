#!/bin/bash
# build.sh -- builds JAR and XPI files for mozilla extensions
#   by Nickolay Ponomarev <asqueella@gmail.com>
#   (original version based on Nathan Yergler's build script)
# Most recent version is at <http://kb.mozillazine.org/Bash_build_script>

# This script assumes the following directory structure:
# ./
#   chrome.manifest (optional - for newer extensions)
#   install.rdf
#   (other files listed in $ROOT_FILES)
#
#   content/    |
#   locale/     |} these can be named arbitrary and listed in $CHROME_PROVIDERS
#   skin/       |
#
#   defaults/   |
#   components/ |} these must be listed in $ROOT_DIRS in order to be packaged
#   ...         |
#
# It uses a temporary directory ./build when building; don't use that!
# Script's output is:
# ./$APP_NAME-$PLATFORM_ID-$VERSION.xpi
# ./$APP_NAME.jar  (only if $KEEP_JAR=1)
# ./files -- the list of packaged files
#
# Note: It modifies chrome.manifest when packaging so that it points to 
#       chrome/$APP_NAME.jar!/*
#
# $Id: build.sh,v 1.17 2008-11-23 05:18:11 cvsuser Exp $

#
# default configuration file is ./build-config.sh, unless another file is 
# specified in command-line. Available config variables:
APP_NAME=           # short-name, jar and xpi files name. Must be lowercase with no spaces
APP_VERSION_NUMBER= # eg: 0.1
APP_VERSION_TESTING= # either empty or a date string depending on whether we're cutting a production or testing release
CHROME_PROVIDERS=   # which chrome providers we have (space-separated list)
CLEAN_UP=           # delete the jar / "files" when done?       (1/0)
ROOT_FILES=         # put these files in root of xpi (space separated list of leaf filenames)
ROOT_DIRS=          # ...and these directories       (space separated list)
BEFORE_BUILD=       # run this before building       (bash command)
BEFORE_JAR=         # run this before making the jar (bash command)
AFTER_BUILD=        # ...and this after the build    (bash command)
PLATFORM_ID=tb+sm   # eg: linux-i686 or win.  Don't set it to the empty string here as we want it to be passed in via the environment.

if [ -z $1 ]; then
  . ./build-config.sh
else
  . $1
fi

if [ "$APP_VERSION_RELTYPE" = "testing" -o "$APP_VERSION_RELTYPE" = "dev" ]; then
	APP_VERSION_NUMBER=$APP_VERSION_NUMBER.`date +%Y%m%d.%H%M%S`
fi

XPI_FILE_NAME=$APP_NAME-$APP_VERSION_NUMBER-$PLATFORM_ID.xpi

export APP_NAME APP_VERSION_NUMBER XPI_FILE_NAME APP_VERSION_RELTYPE # BEFORE_BUILD or AFTER_BUILD might use these...

if [ -z $APP_NAME ]; then
  echo "You need to create build config file first!"
  echo "Read comments at the beginning of this script for more info."
  exit;
fi

ROOT_DIR=`pwd`
TMP_DIR=$ROOT_DIR/build

#uncomment to debug
# set -x

# remove any left-over files from previous build
rm -f $APP_NAME.jar $XPI_FILE_NAME files
rm -rf $TMP_DIR

$BEFORE_BUILD

[ $? -ne "0" ] && exit 1

mkdir --parents --verbose $TMP_DIR/chrome

$BEFORE_JAR

# generate the JAR file, excluding CVS, SVN, and temporary files
JAR_FILE=$TMP_DIR/chrome/$APP_NAME.jar
echo "Generating $JAR_FILE..."
for CHROME_SUBDIR in $CHROME_PROVIDERS; do
  find $CHROME_SUBDIR \( -path '*CVS*' -o -path '*.svn*' -o -path '*.swp' \) -prune -o -type f -print | grep -v \~ >> files
done

zip -0 -r $JAR_FILE -@ < files
# The following statement should be used instead if you don't wish to use the JAR file
#cp --verbose --parents `cat files` $TMP_DIR/chrome

# prepare components and defaults
echo "Copying various files to $TMP_DIR folder..."
for DIR in $ROOT_DIRS; do
  mkdir $TMP_DIR/$DIR
  FILES="`find $DIR \( -path '*CVS*' -o -path '*.svn*' -o -path '*.swp' \) -prune -o -type f -print | grep -v \~`"
  echo $FILES >> files
  cp --verbose --parents $FILES $TMP_DIR
done

# update.rdf
#
set -x
MINVERSION_TB=`sed -r "s#<em:minVersion>(.*)</em:minVersion>.*tb#fredfred \1#" < install.rdf | awk '/fredfred/ { print $2; }'`
MAXVERSION_TB=`sed -r "s#<em:maxVersion>(.*)</em:maxVersion>.*tb#fredfred \1#" < install.rdf | awk '/fredfred/ { print $2; }'`
MINVERSION_SM=`sed -r "s#<em:minVersion>(.*)</em:minVersion>.*sm#fredfred \1#" < install.rdf | awk '/fredfred/ { print $2; }'`
MAXVERSION_SM=`sed -r "s#<em:maxVersion>(.*)</em:maxVersion>.*sm#fredfred \1#" < install.rdf | awk '/fredfred/ { print $2; }'`
DOWNLOAD_DIR=http://www.zindus.com/download/xpi
set +x
sed -i -r "s#em:version=\"(.*)\"#em:version=\"$APP_VERSION_NUMBER\"#" update.rdf
sed -i -r "s#em:updateLink=\"(.*)\"#em:updateLink=\"$DOWNLOAD_DIR/$XPI_FILE_NAME\"#" update.rdf

sed -i -r "s#em:id=\"\{3550f703-e582-4d05-9a08-453d09bdfdc6\}\"#em:id=\"\{3550f703-e582-4d05-9a08-453d09bdfdc6\}\" em:maxVersion=\"$MAXVERSION_TB\" em:minVersion=\"$MINVERSION_TB\"#" update.rdf
sed -i -r "s#em:id=\"\{92650c4d-4b8e-4d2a-b7eb-24ecf4f6b63a\}\"#em:id=\"\{92650c4d-4b8e-4d2a-b7eb-24ecf4f6b63a\}\" em:maxVersion=\"$MAXVERSION_SM\" em:minVersion=\"$MINVERSION_SM\"#" update.rdf

sed -i -r "/  em:maxVersion/d#" update.rdf
sed -i -r "/  em:minVersion/d#" update.rdf

# install.rdf
#
sed -i -r "s#<em:version>(.*)</em:version>#<em:version>$APP_VERSION_NUMBER</em:version>#" install.rdf

updateURL="    <em:updateURL>http://www.zindus.com/download/xpi-update-rdf.php?item_id=%ITEM_ID%\&amp;item_version=%ITEM_VERSION%\&amp;item_status=%ITEM_STATUS%\&amp;app_id=%APP_ID%\&amp;app_os=%APP_OS%\&amp;app_abi=%APP_ABI%"
updateKey="    <em:updateKey>MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCyC+XK8GT8SJpfhxXZu7MM+ALv/OmcRfP3m2m6DzWrB121ToA3zEfUOfD568gDuKExpptuomgNyYRUB32yCQfmHryMS4fXXuG49JGlQq7kMNXW+aSp7IE5Q6DExVhLZ0jOSXk+alWbTWLFpXNLuI0n72T291Otmq0YEyrlqx3UbwIDAQAB</em:updateKey>"

if [ "$APP_VERSION_RELTYPE" = "prod-zindus" -o "$APP_VERSION_RELTYPE" = "testing" -o "$APP_VERSION_RELTYPE" = "dev" ]; then
	sed -i -r "s#.*<em:updateURL>.*</em:updateURL>.*#$updateURL\&amp;reltype=$APP_VERSION_RELTYPE</em:updateURL>#" install.rdf
	sed -i -r "s#.*<em:updateKey>.*</em:updateKey>.*#$updateKey#" install.rdf
elif [ "$APP_VERSION_RELTYPE" = "prod-amo" ]; then
	sed -i -r "s#.*<em:updateURL>.*</em:updateURL>.*#    <!-- <em:updateURL></em:updateURL> -->#" install.rdf
	sed -i -r "s#.*<em:updateKey>.*</em:updateKey>.*#    <!-- <em:updateKey></em:updateKey> -->#" install.rdf
else
	echo Undefined APP_VERSION_RELTYPE - aborting
	exit 1
fi

# Copy other files to the root of future XPI.
for ROOT_FILE in $ROOT_FILES install.rdf chrome.manifest; do
  cp --verbose $ROOT_FILE $TMP_DIR
  if [ -f $ROOT_FILE ]; then
    echo $ROOT_FILE >> files
  fi
done

cd $TMP_DIR

if [ -f "chrome.manifest" ]; then
  echo "Preprocessing chrome.manifest..."
  # You think this is scary?
  #s/^(content\s+\S*\s+)(\S*\/)$/\1jar:chrome\/$APP_NAME\.jar!\/\2/
  #s/^(skin|locale)(\s+\S*\s+\S*\s+)(.*\/)$/\1\2jar:chrome\/$APP_NAME\.jar!\/\3/
  #
  # Then try this! (Same, but with characters escaped for bash :)
  sed -i -r s/^\(content\\s+\\S*\\s+\)\(\\S*\\/\)$/\\1jar:chrome\\/$APP_NAME\\.jar!\\/\\2/ chrome.manifest
  sed -i -r s/^\(skin\|locale\)\(\\s+\\S*\\s+\\S*\\s+\)\(.*\\/\)$/\\1\\2jar:chrome\\/$APP_NAME\\.jar!\\/\\3/ chrome.manifest

  # (it simply adds jar:chrome/whatever.jar!/ at appropriate positions of chrome.manifest)
fi

# generate the XPI file
echo "Generating $XPI_FILE_NAME..."
zip -r ../$XPI_FILE_NAME *

/cygdrive/c/leni/bin/mccoy/mccoy/mccoy.exe -sign file:///c:/cygwin/home/L/wrk/consile/xpi/thunderbird/update.rdf -key zindus-xpi-updatekey  -addOnFileName file:///c:/cygwin/home/L/wrk/consile/xpi/thunderbird/$XPI_FILE_NAME

cd "$ROOT_DIR"

echo "Cleanup..."
if [ $CLEAN_UP = 0 ]; then
  # save the jar file
  mv $TMP_DIR/chrome/$APP_NAME.jar .
else
  rm ./files
fi

# remove the working files
rm -rf $TMP_DIR
echo "Done!"

$AFTER_BUILD
