/*
This file is part of the Notesnook project (https://notesnook.com/)

Copyright (C) 2023 Streetwriters (Private) Limited

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import { EV, EVENTS, SYNC_CHECK_IDS } from "@notesnook/core/dist/common";
import notifee from "@notifee/react-native";
import NetInfo from "@react-native-community/netinfo";
import React, { useCallback, useEffect, useRef } from "react";
import {
  AppState,
  Keyboard,
  Linking,
  NativeEventEmitter,
  NativeModules,
  Platform
} from "react-native";
import RNBootSplash from "react-native-bootsplash";
import { checkVersion } from "react-native-check-version";
import Config from "react-native-config";
import * as RNIap from "react-native-iap";
import { enabled } from "react-native-privacy-snapshot";
import { DatabaseLogger, db } from "../common/database";
import { MMKV } from "../common/database/mmkv";
import Migrate from "../components/sheets/migrate";
import NewFeature from "../components/sheets/new-feature";
import { Walkthrough } from "../components/walkthroughs";
import {
  clearAppState,
  editorController,
  editorState
} from "../screens/editor/tiptap/utils";
import { useDragState } from "../screens/settings/editor/state";
import BackupService from "../services/backup";
import {
  ToastEvent,
  eSendEvent,
  eSubscribeEvent,
  presentSheet
} from "../services/event-manager";
import {
  clearMessage,
  setEmailVerifyMessage,
  setLoginMessage,
  setRateAppMessage,
  setRecoveryKeyMessage,
  setUpdateAvailableMessage
} from "../services/message";
import PremiumService from "../services/premium";
import SettingsService from "../services/settings";
import Sync from "../services/sync";
import { initAfterSync, initialize } from "../stores";
import { useAttachmentStore } from "../stores/use-attachment-store";
import { useEditorStore } from "../stores/use-editor-store";
import { useMessageStore } from "../stores/use-message-store";
import { useNoteStore } from "../stores/use-notes-store";
import { useSettingStore } from "../stores/use-setting-store";
import { SyncStatus, useUserStore } from "../stores/use-user-store";
import { updateStatusBarColor } from "../utils/colors";
import {
  eClearEditor,
  eCloseSheet,
  eLoginSessionExpired,
  eOnLoadNote,
  eOpenAnnouncementDialog,
  eUserLoggedIn,
  refreshNotesPage
} from "../utils/events";
import { getGithubVersion } from "../utils/github-version";
import { tabBarRef } from "../utils/global-refs";
import { sleep } from "../utils/time";

const onCheckSyncStatus = async (type) => {
  const { disableSync, disableAutoSync } = SettingsService.get();
  switch (type) {
    case SYNC_CHECK_IDS.sync:
      return { type, result: !disableSync };
    case SYNC_CHECK_IDS.autoSync:
      return { type, result: !disableAutoSync };
    default:
      return { type, result: true };
  }
};

const onSyncAborted = () => {
  useUserStore.getState().setSyncing(false, SyncStatus.Failed);
};

const onFileEncryptionProgress = ({ total, progress }) => {
  useAttachmentStore
    .getState()
    .setEncryptionProgress((progress / total).toFixed(2));
};

const onDownloadingAttachmentProgress = (data) => {
  useAttachmentStore.getState().setDownloading(data);
};

const onUploadingAttachmentProgress = (data) => {
  useAttachmentStore.getState().setUploading(data);
};

const onDownloadedAttachmentProgress = (data) => {
  useAttachmentStore.getState().setDownloading(data);
};

const onUploadedAttachmentProgress = (data) => {
  useAttachmentStore.getState().setUploading(data);
};

const onUserSessionExpired = async () => {
  SettingsService.set({
    sessionExpired: true
  });
  eSendEvent(eLoginSessionExpired);
};

const onAppOpenedFromURL = async (event) => {
  let url = event ? event.url : "";
  try {
    if (url.startsWith("https://app.notesnook.com/account/verified")) {
      await onUserEmailVerified();
    } else if (url.startsWith("ShareMedia://QuickNoteWidget")) {
      clearAppState();
      editorState().movedAway = false;
      eSendEvent(eOnLoadNote, { type: "new" });
      tabBarRef.current?.goToPage(1, false);
      return;
    }
  } catch (e) {
    console.error(e);
  }
};

const onUserEmailVerified = async () => {
  let user = await db.user.getUser();
  useUserStore.getState().setUser(user);
  if (!user) return;
  SettingsService.set({
    userEmailConfirmed: true
  });
  await PremiumService.setPremiumStatus();
  Walkthrough.present("emailconfirmed", false, true);
  if (user?.isEmailConfirmed) {
    clearMessage();
  }
};

const onUserSubscriptionStatusChanged = async (userStatus) => {
  if (!PremiumService.get() && userStatus.type === 5) {
    PremiumService.subscriptions.clear();
    Walkthrough.present("prouser", false, true);
  }
  await PremiumService.setPremiumStatus();
  useMessageStore.getState().setAnnouncement();
};

const onRequestPartialSync = async (full, force, lastSyncTime) => {
  if (SettingsService.get().disableAutoSync) return;
  DatabaseLogger.info(
    `onRequestPartialSync full:${full}, force:${force}, lastSyncTime:${lastSyncTime}`
  );
  if (full || force) {
    await Sync.run("global", force, full, undefined, lastSyncTime);
  } else {
    await Sync.run("global", false, false, undefined, lastSyncTime);
  }
};

const onLogout = async (reason) => {
  DatabaseLogger.log("User Logged Out" + reason);
  SettingsService.set({
    introCompleted: true
  });
};

async function checkForShareExtensionLaunchedInBackground() {
  try {
    let notesAddedFromIntent = MMKV.getString("notesAddedFromIntent");
    let shareExtensionOpened = MMKV.getString("shareExtensionOpened");
    if (notesAddedFromIntent) {
      if (Platform.OS === "ios") {
        await db.initCollections();
        await db.notes.init();
      }
      eSendEvent(refreshNotesPage);
      MMKV.removeItem("notesAddedFromIntent");
      initAfterSync();
      eSendEvent(refreshNotesPage);
    }

    if (notesAddedFromIntent || shareExtensionOpened) {
      let id = useEditorStore.getState().currentEditingNote;
      let note = id && db.notes.note(id).data;
      eSendEvent("webview_reset");
      setTimeout(() => eSendEvent("loadingNote", note), 1);
      MMKV.removeItem("shareExtensionOpened");
    }
  } catch (e) {
    console.log(e);
  }
}

async function saveEditorState() {
  if (editorState().currentlyEditing) {
    let id = useEditorStore.getState().currentEditingNote;
    let note = id && db.notes.note(id).data;
    if (note?.locked) return;
    let state = JSON.stringify({
      editing: editorState().currentlyEditing,
      note: note,
      movedAway: editorState().movedAway,
      timestamp: Date.now()
    });
    MMKV.setString("appState", state);
  }
}

const onSuccessfulSubscription = async (subscription) => {
  await PremiumService.subscriptions.set(subscription);
  await PremiumService.subscriptions.verify(subscription);
};

const onSubscriptionError = async (error) => {
  ToastEvent.show({
    heading: "Failed to subscribe",
    type: "error",
    message: error.message,
    context: "local"
  });
};

const SodiumEventEmitter = new NativeEventEmitter(NativeModules.Sodium);

export const useAppEvents = () => {
  const loading = useNoteStore((state) => state.loading);
  const setLoading = useNoteStore((state) => state.setLoading);
  const [setLastSynced, setUser, appLocked, syncing] = useUserStore((state) => [
    state.setLastSynced,
    state.setUser,
    state.appLocked,
    state.syncing
  ]);

  const syncedOnLaunch = useRef(false);
  const refValues = useRef({
    subsriptionSuccessListener: null,
    subsriptionErrorListener: null,
    isUserReady: false,
    prevState: null,
    showingDialog: false,
    removeInternetStateListener: null,
    isReconnecting: false,
    initialUrl: null,
    backupDidWait: false
  });

  const onSyncComplete = useCallback(async () => {
    initAfterSync();
    setLastSynced(await db.lastSynced());
    eSendEvent(eCloseSheet, "sync_progress");
  }, [setLastSynced]);

  useEffect(() => {
    let eventSubscriptions = [];
    if (!loading) {
      const eventManager = db?.eventManager;
      eventSubscriptions = [
        eventManager?.subscribe(EVENTS.syncCompleted, onSyncComplete),
        eventManager?.subscribe(
          EVENTS.databaseSyncRequested,
          onRequestPartialSync
        )
      ];
    }
    return () => {
      eventSubscriptions.forEach((sub) => sub?.unsubscribe?.());
    };
  }, [loading, onSyncComplete]);

  useEffect(() => {
    let eventSubscriptions = [
      Linking.addEventListener("url", onAppOpenedFromURL),
      SodiumEventEmitter.addListener(
        "onSodiumProgress",
        onFileEncryptionProgress
      ),
      EV.subscribe(EVENTS.syncCheckStatus, onCheckSyncStatus),
      EV.subscribe(EVENTS.syncAborted, onSyncAborted),
      EV.subscribe(EVENTS.appRefreshRequested, onSyncComplete),
      EV.subscribe(EVENTS.userLoggedOut, onLogout),
      EV.subscribe(EVENTS.userEmailConfirmed, onUserEmailVerified),
      EV.subscribe(EVENTS.userSessionExpired, onUserSessionExpired),
      EV.subscribe(EVENTS.userCheckStatus, PremiumService.onUserStatusCheck),
      EV.subscribe(
        EVENTS.userSubscriptionUpdated,
        onUserSubscriptionStatusChanged
      ),
      EV.subscribe(EVENTS.fileDownload, onDownloadingAttachmentProgress),
      EV.subscribe(EVENTS.fileUpload, onUploadingAttachmentProgress),
      EV.subscribe(EVENTS.fileDownloaded, onDownloadedAttachmentProgress),
      EV.subscribe(EVENTS.fileUploaded, onUploadedAttachmentProgress),
      EV.subscribe(EVENTS.downloadCanceled, (data) => {
        useAttachmentStore.getState().setDownloading(data);
      }),
      EV.subscribe(EVENTS.uploadCanceled, (data) => {
        useAttachmentStore.getState().setUploading(data);
      }),
      eSubscribeEvent(eUserLoggedIn, onUserUpdated)
    ];

    return () => {
      eventSubscriptions.forEach(
        (sub) => sub?.remove?.() || sub?.unsubscribe?.()
      );
      EV.unsubscribeAll();
    };
  }, [onSyncComplete, onUserUpdated]);

  useEffect(() => {
    const onInternetStateChanged = async (state) => {
      if (!syncedOnLaunch.current) return;
      reconnectSSE(state);
    };

    const onAppStateChanged = async (state) => {
      if (state === "active") {
        notifee.setBadgeCount(0);
        updateStatusBarColor();
        if (
          SettingsService.get().appLockMode !== "background" &&
          !SettingsService.get().privacyScreen
        ) {
          enabled(false);
        }
        if (SettingsService.get().appLockMode === "background") {
          if (useSettingStore.getState().requestBiometrics) {
            useSettingStore.getState().setRequestBiometrics(false);
            return;
          }
        }
        checkAutoBackup();
        await reconnectSSE();
        await checkForShareExtensionLaunchedInBackground();
        MMKV.removeItem("appState");
        let user = await db.user.getUser();
        if (user && !user?.isEmailConfirmed) {
          try {
            let user = await db.user.fetchUser();
            if (user?.isEmailConfirmed) {
              onUserEmailVerified();
            }
          } catch (e) {
            console.error(e);
          }
        }
      } else {
        let id = useEditorStore.getState().currentEditingNote;
        let note = id && db.notes.note(id).data;
        if (
          note?.locked &&
          SettingsService.get().appLockMode === "background"
        ) {
          eSendEvent(eClearEditor);
        }
        await saveEditorState();
        if (
          SettingsService.get().appLockMode === "background" &&
          !useSettingStore.getState().requestBiometrics &&
          !useUserStore.getState().appLocked &&
          !useUserStore.getState().disableAppLockRequests
        ) {
          useUserStore.getState().lockApp(true);
          if (Platform.OS === "ios") {
            editorController.current?.commands.blur();
            Keyboard.dismiss();
          }
        }
        if (
          SettingsService.get().privacyScreen ||
          SettingsService.get().appLockMode === "background"
        ) {
          !useSettingStore.getState().requestBiometrics ? enabled(true) : null;
        }
      }
    };

    if (!refValues.current.initialUrl) {
      Linking.getInitialURL().then((url) => {
        refValues.current.initialUrl = url;
      });
    }
    let sub;
    if (!loading && !appLocked) {
      setTimeout(() => {
        sub = AppState.addEventListener("change", onAppStateChanged);
        if (
          refValues.current.initialUrl?.startsWith(
            "https://app.notesnook.com/account/verified"
          )
        ) {
          onUserEmailVerified();
        }
      }, 1000);
      refValues.current.removeInternetStateListener = NetInfo.addEventListener(
        onInternetStateChanged
      );
    }
    return () => {
      refValues.current?.removeInternetStateListener &&
        // eslint-disable-next-line react-hooks/exhaustive-deps
        refValues.current?.removeInternetStateListener();
      sub?.remove();
      unSubscribeFromIAPListeners();
    };
  }, [loading, appLocked, checkAutoBackup]);

  const onUserUpdated = useCallback(
    async (login) => {
      let user;
      try {
        user = await db.user.getUser();
        await PremiumService.setPremiumStatus();
        setLastSynced(await db.lastSynced());
        await useDragState.getState().init();
        if (!user) return;

        let userEmailConfirmed = SettingsService.get().userEmailConfirmed;
        setUser(user);
        if (SettingsService.get().sessionExpired) {
          syncedOnLaunch.current = true;
          return;
        }

        clearMessage();
        subscribeToIAPListeners();
        if (!login) {
          user = await db.user.fetchUser();
          setUser(user);
        } else {
          SettingsService.set({
            encryptedBackup: true
          });
        }

        await PremiumService.setPremiumStatus();
        if (user?.isEmailConfirmed && !userEmailConfirmed) {
          setTimeout(() => {
            onUserEmailVerified();
          }, 1000);
          SettingsService.set({
            userEmailConfirmed: true
          });
        }
      } catch (e) {
        ToastEvent.error(e, "An error occurred", "global");
      }

      user = await db.user.getUser();
      if (
        user?.isEmailConfirmed &&
        !SettingsService.get().recoveryKeySaved &&
        !useMessageStore.getState().message?.visible
      ) {
        setRecoveryKeyMessage();
      }
      if (!user?.isEmailConfirmed) setEmailVerifyMessage();
      refValues.current.isUserReady = true;

      syncedOnLaunch.current = true;
      if (!login) {
        checkAutoBackup();
      }
    },
    [subscribeToIAPListeners, setLastSynced, setUser, checkAutoBackup]
  );

  const subscribeToIAPListeners = useCallback(async () => {
    await RNIap.initConnection()
      .catch(() => null)
      .then(async () => {
        refValues.current.subsriptionSuccessListener =
          RNIap.purchaseUpdatedListener(onSuccessfulSubscription);
        refValues.current.subsriptionErrorListener =
          RNIap.purchaseErrorListener(onSubscriptionError);
      });
  }, []);

  const unSubscribeFromIAPListeners = () => {
    if (refValues.current?.subsriptionSuccessListener) {
      refValues.current.subsriptionSuccessListener?.remove();
      refValues.current.subsriptionSuccessListener = null;
    }
    if (refValues.current?.subsriptionErrorListener) {
      refValues.current.subsriptionErrorListener?.remove();
      refValues.current.subsriptionErrorListener = null;
    }
  };

  const checkAutoBackup = useCallback(async () => {
    const { appLocked, syncing } = useUserStore.getState();

    if (appLocked || syncing) {
      refValues.current.backupDidWait = true;
      return;
    }
    const user = await db.user.getUser();
    if (PremiumService.get() && user) {
      if (
        await BackupService.checkBackupRequired(SettingsService.get().reminder)
      ) {
        if (
          !SettingsService.get().backupDirectoryAndroid &&
          Platform.OS === "android"
        )
          return;
        sleep(2000).then(() => BackupService.run());
      }
    }
  }, []);

  useEffect(() => {
    if (!appLocked && !syncing && refValues.current.backupDidWait) {
      refValues.current.backupDidWait = false;
      checkAutoBackup();
    }
  }, [appLocked, syncing, checkAutoBackup]);

  async function reconnectSSE(connection) {
    if (refValues.current?.isReconnecting || !refValues.current?.isUserReady)
      return;

    if (useSettingStore.getState().appDidEnterBackgroundForAction) {
      useSettingStore.getState().setAppDidEnterBackgroundForAction(false);
      console.log("AppDidEnterForegroundAfterAction");
      return;
    }

    if (SettingsService.get().sessionExpired) {
      refValues.current.isReconnecting = false;
      return;
    }

    refValues.current.isReconnecting = true;
    let connectionState = connection;
    try {
      if (!connectionState) {
        connectionState = await NetInfo.fetch();
      }

      let user = await db.user.getUser();
      if (
        user &&
        connectionState.isConnected &&
        connectionState.isInternetReachable
      ) {
        await db.connectSSE();
      } else {
        useUserStore.getState().setSyncing(false);
        await db.syncer.stop();
      }
      refValues.current.isReconnecting = false;
    } catch (e) {
      refValues.current.isReconnecting = false;
    }
  }

  const IsDatabaseMigrationRequired = useCallback(() => {
    if (!db.migrations.required() || appLocked) return false;

    presentSheet({
      component: <Migrate />,
      onClose: async () => {
        if (!db.isInitialized) {
          await db.init();
        }
        initialize();
        setLoading(false);
      },
      disableClosing: true
    });
    return true;
  }, [appLocked]);

  useEffect(() => {
    if (!loading) {
      (async () => {
        onUserUpdated();
        doAppLoadActions();
      })();
    }
  }, [loading, onUserUpdated]);

  const initializeDatabase = useCallback(async () => {
    if (!db.isInitialized) {
      RNBootSplash.hide({ fade: true });
      DatabaseLogger.info("Initializing database");
      await db.init();
    }
    if (IsDatabaseMigrationRequired()) return;
    initialize();
    setLoading(false);
    Walkthrough.init();
  }, [IsDatabaseMigrationRequired]);

  useEffect(() => {
    let sub;
    if (appLocked) {
      const sub = useUserStore.subscribe((state) => {
        if (
          !state.appLocked &&
          db.isInitialized &&
          useNoteStore.getState().loading
        ) {
          initializeDatabase();
          sub();
        }
      });
    }
    return () => {
      sub?.();
    };
  }, [appLocked, initializeDatabase]);

  return initializeDatabase;
};

const doAppLoadActions = async () => {
  if (SettingsService.get().sessionExpired) {
    eSendEvent(eLoginSessionExpired);
    return;
  }
  notifee.setBadgeCount(0);
  await useMessageStore.getState().setAnnouncement();
  if (NewFeature.present()) return;
  if (await checkAppUpdateAvailable()) return;

  if (!(await db.user.getUser())) {
    setLoginMessage();
    return;
  }
  if (await checkForRateAppRequest()) return;
  if (await PremiumService.getRemainingTrialDaysStatus()) return;
  if (SettingsService.get().introCompleted) {
    useMessageStore.subscribe((state) => {
      let dialogs = state.dialogs;
      if (dialogs.length > 0) {
        eSendEvent(eOpenAnnouncementDialog, dialogs[0]);
      }
    });
  }
};

const checkAppUpdateAvailable = async () => {
  if (__DEV__ || Config.isTesting === "true" || Config.FDROID_BUILD) return;
  try {
    const version =
      Config.GITHUB_RELEASE === "true"
        ? await getGithubVersion()
        : await checkVersion();
    if (!version || !version?.needsUpdate) return false;

    setUpdateAvailableMessage(version);
    return true;
  } catch (e) {
    return false;
  }
};

const checkForRateAppRequest = async () => {
  let rateApp = SettingsService.get().rateApp;
  if (
    rateApp &&
    rateApp < Date.now() &&
    !useMessageStore.getState().message?.visible
  ) {
    setRateAppMessage();
    return false;
  }
  return false;
};
