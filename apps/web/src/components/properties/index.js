import React from "react";
import * as Icon from "react-feather";
import { Box, Flex, Text } from "rebass";
import { Input } from "@rebass/forms";
import CheckBox from "../checkbox";
import { PinIcon } from "../icons";
import { useStore } from "../../stores/editor-store";
import { COLORS } from "../../common";
import { objectMap } from "../../utils/object";
import { useStore as useAppStore } from "../../stores/app-store";

const Properties = props => {
  const pinned = useStore(store => store.session.pinned);
  const favorite = useStore(store => store.session.favorite);
  const colors = useStore(store => store.session.colors);
  const tags = useStore(store => store.session.tags);

  const setSession = useStore(store => store.setSession);
  const setColor = useStore(store => store.setColor);
  const setTag = useStore(store => store.setTag);
  function changeState(prop, value) {
    setSession(state => {
      state.session[prop] = value;
    });
  }
  const hideProperties = useAppStore(store => store.hideProperties);
  const showProperties = useAppStore(store => store.showProperties);
  const arePropertiesVisible = useAppStore(store => store.arePropertiesVisible);

  return (
    <>
      <Box
        onClick={() => {
          showProperties();
        }}
        sx={{
          display: arePropertiesVisible ? "none" : "flex",
          position: "absolute",
          top: "50%",
          right: 0,
          color: "static",
          borderRadius: "100px 0px 0px 100px",
          cursor: "pointer",
          height: [0, 0, 60]
        }}
        alignItems="center"
        justifyContent="center"
        bg="primary"
      >
        <Icon.ChevronLeft size={32} />
      </Box>
      <Box
        sx={{
          position: arePropertiesVisible ? "absolute" : "relative",
          right: 0,
          display: arePropertiesVisible ? "flex" : "none",
          borderLeft: "1px solid",
          borderColor: "border",
          width: [0, 0, "20%"]
        }}
        flexDirection="column"
        bg="background"
        px={3}
        py={0}
      >
        <Text
          variant="title"
          color="primary"
          my={2}
          alignItems="center"
          justifyContent="space-between"
          sx={{ display: "flex" }}
        >
          Properties
          <Text
            as="span"
            onClick={() => {
              hideProperties();
            }}
            sx={{
              color: "red",
              height: 24,
              ":active": { color: "darkRed" }
            }}
          >
            <Icon.X />
          </Text>
        </Text>
        <CheckBox
          checked={pinned}
          icon={PinIcon}
          label="Pin"
          onChecked={state => changeState("pinned", state)}
        />
        <CheckBox
          icon={Icon.Star}
          checked={favorite}
          label="Favorite"
          onChecked={state => changeState("favorite", state)}
        />
        <CheckBox icon={Icon.Lock} label="Lock" onChecked={props.onLocked} />
        <Flex fontSize="body" sx={{ marginBottom: 3 }} alignItems="center">
          <Icon.Book size={18} />
          <Text sx={{ marginLeft: 1 }}>Move to notebook</Text>
        </Flex>
        <Flex fontSize="body" sx={{ marginBottom: 2 }} alignItems="center">
          <Icon.Tag size={18} />
          <Text sx={{ marginLeft: 1 }}>Tags:</Text>
        </Flex>
        <Input
          variant="default"
          placeholder="#tag"
          sx={{ marginBottom: 2 }}
          onKeyUp={event => {
            if (
              event.key === "Enter" ||
              event.key === " " ||
              event.key === ","
            ) {
              const value = event.target.value;
              setTag(value.trim().replace(",", ""));
              event.target.value = "";
            }
          }}
        />
        <Flex
          fontSize="body"
          sx={{ marginBottom: 2 }}
          alignItems="center"
          justifyContent="flex-start"
          flexWrap="wrap"
        >
          {tags.map(tag => (
            <Text
              sx={{
                backgroundColor: "primary",
                color: "static",
                borderRadius: "default",
                padding: "2px 5px 2px 5px",
                marginBottom: 1,
                marginRight: 1,
                cursor: "pointer"
              }}
              onClick={() => {
                setTag(tag);
              }}
            >
              #{tag}
            </Text>
          ))}
        </Flex>
        <Flex fontSize="body" sx={{ marginBottom: 2 }} alignItems="center">
          <Icon.Octagon size={18} />
          <Text sx={{ marginLeft: 1 }}>Colors:</Text>
        </Flex>
        <Flex flexWrap="wrap" sx={{ marginBottom: 2 }}>
          {objectMap(COLORS, (label, code) => (
            <Flex
              sx={{ position: "relative" }}
              justifyContent="center"
              alignItems="center"
              onClick={() => setColor(label)}
              key={label}
            >
              <Icon.Circle
                size={40}
                style={{ cursor: "pointer" }}
                fill={code}
                strokeWidth={0}
              />
              {colors.includes(label) && (
                <Icon.Check
                  style={{
                    position: "absolute",
                    cursor: "pointer",
                    color: "white"
                  }}
                  size={20}
                />
              )}
            </Flex>
          ))}
        </Flex>
      </Box>
    </>
  );
};

export default React.memo(Properties);
