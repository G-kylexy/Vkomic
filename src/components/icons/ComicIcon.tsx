import React from "react";
import { Platform } from "react-native";
import Svg, { Path, Circle, Rect, G } from "react-native-svg";

// Icônes style BD ligne claire (Tintin)
// Caractéristiques: contours noirs nets 2px, formes simples, remplissage couleur unie

export type ComicIconName =
  | "home"
  | "library"
  | "download"
  | "settings"
  | "folder"
  | "file"
  | "search"
  | "cloud"
  | "chevron-forward"
  | "close"
  | "checkmark"
  | "play"
  | "pause"
  | "refresh"
  | "trash";

interface ComicIconProps {
  name: ComicIconName;
  size?: number;
  color?: string;
  strokeColor?: string;
}

const STROKE_WIDTH = 2;
const DEFAULT_STROKE = "#1a1a1a";

export const ComicIcon: React.FC<ComicIconProps> = ({
  name,
  size = 24,
  color = "#3B82F6",
  strokeColor = DEFAULT_STROKE,
}) => {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    style: {
      transform: [{ rotate: (name === "home" || name === "settings") ? "1.5deg" : "-1.5deg" }],
    }
  };


  switch (name) {
    case "home":
      // Maison style BD - toit triangulaire, corps rectangulaire
      return (
        <Svg {...props}>
          <Path
            d="M3.2 10.8L11.8 3.2L21.2 10.2V20.2C21.2 20.7 20.7 21.2 20.2 21.2H3.8C3.3 21.2 2.8 20.7 2.8 20.2V10.8Z"
            fill={color}
            stroke={strokeColor}
            strokeWidth={STROKE_WIDTH + 0.2}
            strokeLinejoin="round"
          />

          <Rect
            x="9"
            y="14"
            width="6"
            height="7"
            fill={strokeColor}
            stroke={strokeColor}
            strokeWidth={1}
          />
        </Svg>
      );

    case "library":
      // Livres empilés style BD
      return (
        <Svg {...props}>
          <G>
            {/* Livre 1 (gauche) */}
            <Rect
              x="3.2"
              y="4.5"
              width="4.8"
              height="15.5"
              rx="2"
              fill={color}
              stroke={strokeColor}
              strokeWidth={STROKE_WIDTH}
            />
            {/* Livre 2 (milieu) */}
            <Rect
              x="8.5"
              y="6.5"
              width="5.5"
              height="13.5"
              rx="2"
              fill="#F97316"
              stroke={strokeColor}
              strokeWidth={STROKE_WIDTH}
              transform={[{ rotate: "2deg" }]}
            />
            {/* Livre 3 (droite) */}
            <Rect
              x="15.5"
              y="3.5"
              width="4.5"
              height="16.5"
              rx="2"
              fill="#22C55E"
              stroke={strokeColor}
              strokeWidth={STROKE_WIDTH}
              transform={[{ rotate: "-1deg" }]}
            />

          </G>
        </Svg>
      );

    case "download":
      // Flèche de téléchargement style BD
      return (
        <Svg {...props}>
          <Path
            d="M11.8 3.5V14.5M11.8 14.5L7.2 10.2M11.8 14.5L16.8 10.2"
            stroke={strokeColor}
            strokeWidth={STROKE_WIDTH + 0.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Path
            d="M4.2 16.8V19.2C4.2 20.2 5.2 21.2 6.2 21.2H17.8C18.8 21.2 19.8 20.2 19.8 19.2V16.8"
            stroke={strokeColor}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            fill="none"
          />
          <Circle cx="12.2" cy="14.8" r="3.2" fill={color} stroke={strokeColor} strokeWidth={1.5} />

        </Svg>
      );

    case "settings":
      // Engrenage style BD cartoon
      return (
        <Svg {...props}>
          <Circle
            cx="12"
            cy="12"
            r="3"
            fill={color}
            stroke={strokeColor}
            strokeWidth={STROKE_WIDTH}
          />
          <Path
            d="M12 1V4M12 20V23M23 12H20M4 12H1M20.5 3.5L18.4 5.6M5.6 18.4L3.5 20.5M20.5 20.5L18.4 18.4M5.6 5.6L3.5 3.5"
            stroke={strokeColor}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
          />
          <Circle
            cx="12"
            cy="12"
            r="7"
            fill="none"
            stroke={strokeColor}
            strokeWidth={STROKE_WIDTH}
          />
        </Svg>
      );

    case "folder":
      // Dossier style BD avec onglet
      return (
        <Svg {...props}>
          <Path
            d="M3 6C3 5 4 4 5 4H9L11 6H19C20 6 21 7 21 8V18C21 19 20 20 19 20H5C4 20 3 19 3 18V6Z"
            fill={color}
            stroke={strokeColor}
            strokeWidth={STROKE_WIDTH}
            strokeLinejoin="round"
          />
        </Svg>
      );

    case "file":
      // Document avec coin plié style BD
      return (
        <Svg {...props}>
          <Path
            d="M6 2H14L20 8V20C20 21 19 22 18 22H6C5 22 4 21 4 20V4C4 3 5 2 6 2Z"
            fill={color}
            stroke={strokeColor}
            strokeWidth={STROKE_WIDTH}
            strokeLinejoin="round"
          />
          <Path
            d="M14 2V8H20"
            stroke={strokeColor}
            strokeWidth={STROKE_WIDTH}
            strokeLinejoin="round"
            fill="none"
          />
          {/* Lignes de texte */}
          <Path d="M8 12H16M8 16H13" stroke={strokeColor} strokeWidth={1.5} strokeLinecap="round" />
        </Svg>
      );

    case "search":
      // Loupe style BD avec manche épais
      return (
        <Svg {...props}>
          <Circle
            cx="10"
            cy="10"
            r="6"
            fill={color}
            stroke={strokeColor}
            strokeWidth={STROKE_WIDTH}
          />
          <Circle cx="10" cy="10" r="3" fill="white" stroke={strokeColor} strokeWidth={1} />
          <Path
            d="M15 15L21 21"
            stroke={strokeColor}
            strokeWidth={STROKE_WIDTH + 1}
            strokeLinecap="round"
          />
        </Svg>
      );

    case "cloud":
      // Nuage style BD
      return (
        <Svg {...props}>
          <Path
            d="M6 19C3.8 19 2 17.2 2 15C2 13 3.5 11.3 5.5 11C5.8 8.2 8.1 6 11 6C13.5 6 15.6 7.6 16.3 10C16.5 10 16.8 10 17 10C19.2 10 21 11.8 21 14C21 16.2 19.2 18 17 18"
            fill={color}
            stroke={strokeColor}
            strokeWidth={STROKE_WIDTH}
            strokeLinejoin="round"
          />
        </Svg>
      );

    case "chevron-forward":
      return (
        <Svg {...props}>
          <Path
            d="M9 5L16 12L9 19"
            stroke={strokeColor}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      );

    case "close":
      return (
        <Svg {...props}>
          <Path
            d="M6 6L18 18M18 6L6 18"
            stroke={strokeColor}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
          />
        </Svg>
      );

    case "checkmark":
      return (
        <Svg {...props}>
          <Path
            d="M4 12L9 17L20 6"
            stroke={color}
            strokeWidth={STROKE_WIDTH + 1}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      );

    case "play":
      return (
        <Svg {...props}>
          <Path
            d="M6 4L20 12L6 20V4Z"
            fill={color}
            stroke={strokeColor}
            strokeWidth={STROKE_WIDTH}
            strokeLinejoin="round"
          />
        </Svg>
      );

    case "pause":
      return (
        <Svg {...props}>
          <Rect
            x="5"
            y="4"
            width="5"
            height="16"
            rx="1"
            fill={color}
            stroke={strokeColor}
            strokeWidth={STROKE_WIDTH}
          />
          <Rect
            x="14"
            y="4"
            width="5"
            height="16"
            rx="1"
            fill={color}
            stroke={strokeColor}
            strokeWidth={STROKE_WIDTH}
          />
        </Svg>
      );

    case "refresh":
      return (
        <Svg {...props}>
          <Path
            d="M4 12C4 7.6 7.6 4 12 4C15.1 4 17.8 5.8 19 8.5M20 12C20 16.4 16.4 20 12 20C8.9 20 6.2 18.2 5 15.5"
            stroke={strokeColor}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            fill="none"
          />
          <Path d="M19 4V9H14" stroke={strokeColor} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Path d="M5 20V15H10" stroke={strokeColor} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
      );

    case "trash":
      return (
        <Svg {...props}>
          <Path
            d="M4 6H20M9 6V4H15V6M6 6V20C6 21 7 22 8 22H16C17 22 18 21 18 20V6"
            stroke={strokeColor}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Path d="M10 10V17M14 10V17" stroke={strokeColor} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
        </Svg>
      );

    default:
      // Fallback: cercle simple
      return (
        <Svg {...props}>
          <Circle
            cx="12"
            cy="12"
            r="8"
            fill={color}
            stroke={strokeColor}
            strokeWidth={STROKE_WIDTH}
          />
        </Svg>
      );
  }
};

export default ComicIcon;
