import React from "react";
import { ImageBackground, View, StyleSheet } from "react-native";

// Fond papier global + trame halftone discrète pour donner un rendu "page imprimée".
export const PageBackground: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ImageBackground
      source={require("../../assets/paper_texture.png")}
      resizeMode="repeat"
      style={styles.bg}
    >
      <ImageBackground
        source={require("../../assets/halftone.png")}
        resizeMode="repeat"
        style={styles.halftone}
        imageStyle={styles.halftoneImage}
      />
      <View
        style={[styles.misprint, styles.misprintDark]}
      />
      <View style={styles.pageEdge} />
      {children}
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  bg: { flex: 1 },
  halftone: {
    ...StyleSheet.absoluteFillObject,
  },
  halftoneImage: {
    opacity: 0.12,
  },
  misprint: {
    ...StyleSheet.absoluteFillObject,
    transform: [{ translateX: 1.5 }, { translateY: 1.5 }],
  },
  misprintLight: {
    backgroundColor: "rgba(0,0,0,0.025)",
  },
  misprintDark: {
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  pageEdge: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    bottom: 10,
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.08)",
    borderRadius: 6,
  },
});
