import React, { useMemo, useState } from "react";
import { LayoutChangeEvent, StyleSheet, Text, View, ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useVk } from "../context/VkContext";
import { comicsBorder, spacing } from "../theme";

type PanelProps = {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  style?: ViewStyle;
  accentColor?: string;
  compact?: boolean;
};

const jitteredFrame = (w: number, h: number) => {
  const pad = 8;
  const jitter = (seed: number, amplitude: number) => {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return ((x - Math.floor(x)) * 2 - 1) * amplitude;
  };

  const tl = { x: pad + jitter(w + h, 2), y: pad + jitter(w, 2) };
  const tr = { x: w - pad + jitter(h, 2), y: pad + jitter(w * 0.4, 2) };
  const br = { x: w - pad + jitter(w * 0.7, 2), y: h - pad + jitter(h, 2) };
  const bl = { x: pad + jitter(h * 0.5, 2), y: h - pad + jitter(w * 0.2, 2) };

  return `M${tl.x},${tl.y} L${tr.x},${tr.y} L${br.x},${br.y} L${bl.x},${bl.y} Z`;
};

export const Panel: React.FC<PanelProps> = ({
  title,
  subtitle,
  children,
  style,
  accentColor,
  compact = false,
}) => {
  const { activePalette: palette } = useVk();
  const isComics = false; // Dark theme only
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width && height && (width !== frameSize.width || height !== frameSize.height)) {
      setFrameSize({ width, height });
    }
  };

  const framePath = useMemo(() => {
    if (frameSize.width <= 0 || frameSize.height <= 0) return "";
    return jitteredFrame(frameSize.width, frameSize.height);
  }, [frameSize.height, frameSize.width]);

  const ink = comicsBorder.color;
  const cartoucheBg = isComics ? "#fff6dc" : "#111827";
  const cartoucheText = isComics ? "#0f172a" : "#f8fafc";
  const baseSurface = isComics ? "rgba(255,255,255,0.92)" : palette.surface;
  const panelRadius = isComics ? 10 : 18;

  return (
    <View style={[styles.wrapper, style]} onLayout={onLayout}>
      <View
        style={[
          styles.panel,
          {
            backgroundColor: baseSurface,
            padding: compact ? spacing.md : spacing.lg,
            borderRadius: panelRadius,
          },
          isComics ? styles.panelShadow : styles.panelShadowDark,
        ]}
      >
        {framePath ? (
          <>
            <Svg
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            >
              <Path
                d={framePath}
                stroke={`${ink}12`}
                strokeWidth={comicsBorder.width + 1.2}
                fill="none"
              />
              <Path
                d={framePath}
                stroke={ink}
                strokeWidth={comicsBorder.width + 0.8}
                fill="none"
              />
            </Svg>
          </>
        ) : null}

        <View
          style={[
            styles.cartouche,
            isComics && styles.cartoucheShadow,
            { backgroundColor: cartoucheBg, borderColor: ink, borderWidth: isComics ? 3 : 2 },
          ]}
        >
          {accentColor ? (
            <View pointerEvents="none" style={[styles.cartoucheAccent, { backgroundColor: accentColor }]} />
          ) : null}
          <Text style={[styles.title, { color: cartoucheText }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: `${cartoucheText}cc` }]}>{subtitle}</Text> : null}
        </View>

        <View style={styles.body}>{children}</View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: spacing.lg,
  },
  panel: {
    borderRadius: 18,
    overflow: "hidden",
  },
  panelShadow: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 3, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 0,
  },
  panelShadowDark: {
    shadowColor: "#0b1222",
    shadowOffset: { width: 2, height: 3 },
    shadowOpacity: 0.45,
    shadowRadius: 0,
    elevation: 6,
  },
  cartoucheShadow: {
    shadowColor: "#111827",
    shadowOffset: { width: 1.5, height: 1.5 },
    shadowOpacity: 0.8,
    shadowRadius: 0,
  },
  cartouche: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    alignSelf: "flex-start",
    marginBottom: spacing.md,
    transform: [{ rotate: "-0.7deg" }],
    overflow: "hidden",
  },
  cartoucheAccent: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.18,
  },
  title: {
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  body: {
    gap: spacing.md,
  },
});
