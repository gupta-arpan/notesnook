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

import { Button, Flex, Text } from "@theme-ui/components";
import EditorFooter from "../editor/footer";
import {
  Circle,
  Sync,
  Loading,
  Update,
  SyncError,
  Checkmark,
  Alert,
  Issue,
  SyncOff,
  Icon
} from "../icons";
import { useStore as useUserStore } from "../../stores/user-store";
import { useStore as useAppStore } from "../../stores/app-store";
import TimeAgo from "../time-ago";
import { hardNavigate, hashNavigate, navigate } from "../../navigation";
import { useAutoUpdater, UpdateStatus } from "../../hooks/use-auto-updater";
import {
  showIssueDialog,
  showUpdateAvailableNotice
} from "../../common/dialog-controller";
import useStatus, { statusToString } from "../../hooks/use-status";
import { ScopedThemeProvider } from "../theme-provider";
import { checkForUpdate, installUpdate } from "../../utils/updater";
import { toTitleCase } from "@notesnook/common";

function StatusBar() {
  const user = useUserStore((state) => state.user);
  const isLoggedIn = useUserStore((state) => state.isLoggedIn);
  const statuses = useStatus();
  const updateStatus = useAutoUpdater();

  return (
    <ScopedThemeProvider
      scope="statusBar"
      bg="background"
      sx={{
        borderTop: "1px solid",
        borderTopColor: "separator",
        justifyContent: "space-between",
        display: ["none", "none", "flex"]
      }}
      px={2}
    >
      <Flex>
        {isLoggedIn ? (
          <>
            <Button
              onClick={() =>
                user?.isEmailConfirmed
                  ? navigate("/settings")
                  : hashNavigate("/email/verify")
              }
              variant="statusitem"
              sx={{
                alignItems: "center",
                justifyContent: "center",
                display: "flex"
              }}
            >
              <Circle
                size={7}
                color={
                  user?.isEmailConfirmed
                    ? "var(--icon-success)"
                    : "var(--icon-error)"
                }
              />
              <Text
                className="selectable"
                variant="subBody"
                ml={1}
                sx={{ color: "paragraph" }}
              >
                {user?.email}
                {user?.isEmailConfirmed ? "" : " (not verified)"}
              </Text>
            </Button>

            <SyncStatus />
          </>
        ) : isLoggedIn === false ? (
          <Button
            variant="statusitem"
            onClick={() => hardNavigate("/login")}
            sx={{
              alignItems: "center",
              justifyContent: "center",
              display: "flex"
            }}
            data-test-id="not-logged-in"
          >
            <Circle size={7} color="var(--icon-error)" />
            <Text variant="subBody" ml={1} sx={{ color: "paragraph" }}>
              Not logged in
            </Text>
          </Button>
        ) : null}
        <Button
          variant="statusitem"
          onClick={() => showIssueDialog()}
          sx={{
            alignItems: "center",
            justifyContent: "center",
            display: "flex"
          }}
          title="Facing an issue? Click here to create a bug report."
        >
          <Issue size={12} />
          <Text variant="subBody" ml={1} sx={{ color: "paragraph" }}>
            Report an issue
          </Text>
        </Button>
        {statuses?.map((status) => {
          const { key, icon: Icon } = status;
          return (
            <Flex
              key={key}
              ml={1}
              sx={{ alignItems: "center", justifyContent: "center" }}
            >
              {Icon ? <Icon size={12} /> : <Loading size={12} />}
              <Text variant="subBody" ml={1} sx={{ color: "paragraph" }}>
                {statusToString(status)}
              </Text>
            </Flex>
          );
        })}

        {updateStatus && updateStatus.type !== "updated" && (
          <Button
            variant="statusitem"
            onClick={async () => {
              if (updateStatus.type === "available") {
                await showUpdateAvailableNotice(updateStatus);
              } else if (updateStatus.type === "completed") {
                installUpdate();
              } else {
                checkForUpdate();
              }
            }}
            sx={{
              ml: 1,
              alignItems: "center",
              justifyContent: "center",
              display: "flex"
            }}
          >
            <Update
              rotate={
                updateStatus.type !== "completed" &&
                updateStatus.type !== "available"
              }
              color={updateStatus.type === "available" ? "accent" : "paragraph"}
              size={12}
            />
            <Text variant="subBody" ml={1} sx={{ color: "paragraph" }}>
              {statusToInfoText(updateStatus)}
            </Text>
          </Button>
        )}
      </Flex>
      <EditorFooter />
    </ScopedThemeProvider>
  );
}

export default StatusBar;

function statusToInfoText(status: UpdateStatus) {
  const { type } = status;
  return type === "checking"
    ? "Checking for updates..."
    : type === "downloading"
    ? `${Math.round(status.progress)}% updating...`
    : type === "completed"
    ? `v${status.version} downloaded (restart required)`
    : type === "available"
    ? `v${status.version} available`
    : "";
}

function SyncStatus() {
  const syncStatus = useAppStore(
    (state) => state.syncStatus
  ) /* TODO: remove this type coercing */ as unknown as SyncState;
  const lastSynced = useAppStore((state) => state.lastSynced);
  const isSyncEnabled = useAppStore((state) => state.isSyncEnabled);
  const sync = useAppStore((state) => state.sync);
  const user = useUserStore((state) => state.user);

  const status = syncStatusFilters.find((f) =>
    f.isActive(syncStatus.key, user, lastSynced)
  );

  if (!status) return null;
  return (
    <Button
      variant="statusitem"
      onClick={() => (isSyncEnabled ? sync() : null)}
      sx={{
        alignItems: "center",
        justifyContent: "center",
        display: "flex",
        color: "paragraph",
        height: "100%"
      }}
      title={status.tooltip}
      data-test-id={`sync-status-${status.key}`}
    >
      {!syncStatus.progress && (
        <status.icon
          size={12}
          rotate={status.loading}
          color={status.iconColor}
        />
      )}
      <Text
        variant="body"
        sx={{ ml: status.text ? "3px" : 0, fontSize: "subBody" }}
      >
        {status.text ? (
          <>
            {typeof status.text === "string" ? (
              status.text
            ) : (
              <status.text lastSynced={lastSynced} type={syncStatus.type} />
            )}{" "}
          </>
        ) : null}
      </Text>
      {syncStatus.progress && (
        <Text variant={"subBody"} ml={1}>
          {" "}
          ({syncStatus.progress})
        </Text>
      )}
    </Button>
  );
}

type SyncState = {
  key: SyncStatus;
  progress: number;
  type: SyncType;
};
type SyncType = "download" | "upload" | "sync";
type SyncStatus =
  | "synced"
  | "syncing"
  | "conflicts"
  | "failed"
  | "completed"
  | "offline"
  | "disabled";
type SyncStatusFilter = {
  key: SyncStatus | "emailNotConfirmed";
  icon: Icon;
  isActive: (
    syncStatus: SyncStatus,
    user: User | undefined,
    lastSynced: number
  ) => boolean;
  text:
    | string
    | ((props: {
        type?: "download" | "upload" | "sync";
        user?: User;
        lastSynced: number;
      }) => JSX.Element);
  tooltip?: string;
  iconColor?: string;
  loading?: boolean;
};

const syncStatusFilters: SyncStatusFilter[] = [
  {
    key: "synced",
    isActive: (syncStatus) => syncStatus === "synced",
    icon: Sync,
    text: ({ lastSynced }) =>
      lastSynced ? (
        <TimeAgo live={true} locale="en_short" datetime={lastSynced} />
      ) : (
        <>click to sync</>
      ),
    tooltip: "All changes are synced."
  },
  {
    key: "syncing",
    isActive: (syncStatus) => syncStatus === "syncing",
    icon: Sync,
    loading: true,
    text: ({ type }) => <>{toTitleCase(type || "sync")}ing</>,
    tooltip: "Syncing your notes..."
  },
  {
    key: "completed",
    isActive: (syncStatus) => syncStatus === "completed",
    icon: Checkmark,
    iconColor: "var(--icon-success)",
    text: ""
  },
  {
    key: "conflicts",
    isActive: (syncStatus) => syncStatus === "conflicts",
    icon: Alert,
    iconColor: "var(--icon-error)",
    text: "Merge conflicts",
    tooltip: "Please resolve all merge conflicts and run the sync again."
  },
  {
    key: "emailNotConfirmed",
    isActive: (_syncStatus, user) => !user?.isEmailConfirmed,
    icon: Alert,
    iconColor: "var(--icon-error)",
    text: "Sync disabled",
    tooltip: "Please confirm your email to start syncing."
  },
  {
    key: "failed",
    isActive: (syncStatus) => syncStatus === "failed",
    icon: SyncError,
    iconColor: "var(--icon-error)",
    text: "Sync failed",
    tooltip: "Sync failed to completed. Please try again."
  },
  {
    key: "offline",
    isActive: (syncStatus) => syncStatus === "offline",
    icon: SyncOff,
    text: ({ lastSynced }) => (
      <>
        <TimeAgo live={true} locale="en_short" datetime={lastSynced} />{" "}
        (offline)
      </>
    ),
    tooltip: "You are offline."
  },
  {
    key: "disabled",
    iconColor: "var(--icon-disabled)",
    isActive: (syncStatus) => syncStatus === "disabled",
    icon: SyncOff,
    text: "Sync disabled",
    tooltip: "Sync is disabled."
  }
];
