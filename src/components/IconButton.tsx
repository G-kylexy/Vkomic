import React, { useState, useCallback, useRef } from "react";
import {
  Pressable,
  Text,
  View,
  StyleSheet,
  Animated,
  ViewStyle,
  GestureResponderEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useVk } from "../context/VkContext";
import { radius, spacing } from "../theme";

interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  size?: number;
  color?: string;
  tooltip?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: ViewStyle;
  disabled?: boolean;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  size = 20,
  color,
  tooltip,
  onPress,
  onLongPress,
  style,
  disabled = false,
}) => {
  const { activePalette: p } = useVk();
  const [showTooltip, setShowTooltip] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltipWithAnimation = useCallback(() => {
    if (!tooltip) return;

    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    setShowTooltip(true);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [tooltip, fadeAnim]);

  const hideTooltipWithAnimation = useCallback(() => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setShowTooltip(false);
    });
  }, [fadeAnim]);

  const handleLongPress = useCallback(() => {
    showTooltipWithAnimation();

    hideTimeoutRef.current = setTimeout(() => {
      hideTooltipWithAnimation();
    }, 2000);

    onLongPress?.();
  }, [showTooltipWithAnimation, hideTooltipWithAnimation, onLongPress]);

  const handlePressOut = useCallback(() => {
    if (showTooltip) {
      hideTimeoutRef.current = setTimeout(() => {
        hideTooltipWithAnimation();
      }, 800);
    }
  }, [showTooltip, hideTooltipWithAnimation]);

  const handlePress = useCallback(() => {
    if (!disabled) {
      onPress?.();
    }
  }, [disabled, onPress]);

  const iconColor = color || p.text;

  return (
    <View style={styles.wrapper}>
      <Pressable
        style={({ pressed }) => [
          styles.button,
          { opacity: pressed ? 0.7 : disabled ? 0.4 : 1 },
          style,
        ]}
        onPress={handlePress}
        onLongPress={handleLongPress}
        onPressOut={handlePressOut}
        disabled={disabled}
        delayLongPress={300}
      >
        <Ionicons name={icon} size={size} color={iconColor} />
      </Pressable>

      {showTooltip && tooltip && (
        <Animated.View
          style={[
            styles.tooltip,
            {
              backgroundColor: p.surface,
              borderColor: `${p.border}80`,
              opacity: fadeAnim,
              transform: [
                {
                  translateY: fadeAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [5, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={[styles.tooltipText, { color: p.text }]}>{tooltip}</Text>
          <View style={[styles.tooltipArrow, { borderBottomColor: p.surface }]} />
        </Animated.View>
      )}
    </View>
  );
};

// Composant wrapper pour ajouter un tooltip à n'importe quel élément
interface TooltipWrapperProps {
  tooltip: string;
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: ViewStyle;
  disabled?: boolean;
}

export const TooltipWrapper: React.FC<TooltipWrapperProps> = ({
  tooltip,
  children,
  onPress,
  onLongPress,
  style,
  disabled = false,
}) => {
  const { activePalette: p } = useVk();
  const [showTooltip, setShowTooltip] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltipWithAnimation = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }

    setShowTooltip(true);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const hideTooltipWithAnimation = useCallback(() => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setShowTooltip(false);
    });
  }, [fadeAnim]);

  const handleLongPress = useCallback((e: GestureResponderEvent) => {
    showTooltipWithAnimation();

    hideTimeoutRef.current = setTimeout(() => {
      hideTooltipWithAnimation();
    }, 2000);

    onLongPress?.();
  }, [showTooltipWithAnimation, hideTooltipWithAnimation, onLongPress]);

  const handlePressOut = useCallback(() => {
    if (showTooltip) {
      hideTimeoutRef.current = setTimeout(() => {
        hideTooltipWithAnimation();
      }, 800);
    }
  }, [showTooltip, hideTooltipWithAnimation]);

  return (
    <View style={styles.wrapper}>
      <Pressable
        style={({ pressed }) => [
          { opacity: pressed ? 0.7 : disabled ? 0.4 : 1 },
          style,
        ]}
        onPress={onPress}
        onLongPress={handleLongPress}
        onPressOut={handlePressOut}
        disabled={disabled}
        delayLongPress={300}
      >
        {children}
      </Pressable>

      {showTooltip && (
        <Animated.View
          style={[
            styles.tooltip,
            {
              backgroundColor: p.surface,
              borderColor: `${p.border}80`,
              opacity: fadeAnim,
              transform: [
                {
                  translateY: fadeAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [5, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={[styles.tooltipText, { color: p.text }]}>{tooltip}</Text>
          <View style={[styles.tooltipArrow, { borderBottomColor: p.surface }]} />
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
    zIndex: 1,
  },
  button: {
    padding: spacing.xs,
  },
  tooltip: {
    position: "absolute",
    bottom: "100%",
    left: "50%",
    marginLeft: -50,
    marginBottom: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    width: 100,
    alignItems: "center",
    zIndex: 1000,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  tooltipText: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  tooltipArrow: {
    position: "absolute",
    bottom: -6,
    left: "50%",
    marginLeft: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    transform: [{ rotate: "180deg" }],
  },
});
