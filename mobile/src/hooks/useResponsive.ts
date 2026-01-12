import { useWindowDimensions } from "react-native";
import { useMemo } from "react";

export type DeviceType = "phone" | "tablet" | "largeTablet";

export interface ResponsiveValues {
  screenWidth: number;
  screenHeight: number;
  deviceType: DeviceType;
  isPhone: boolean;
  isTablet: boolean;
  isLargeTablet: boolean;
  isLandscape: boolean;
  numColumns: number;
  gridGap: number;
  fontSize: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
}

/**
 * Hook for responsive design across different screen sizes
 * - Phone: < 600px
 * - Tablet: 600px - 900px
 * - Large Tablet: > 900px
 */
export const useResponsive = (): ResponsiveValues => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  return useMemo(() => {
    const isLandscape = screenWidth > screenHeight;

    // Determine device type based on width
    let deviceType: DeviceType = "phone";
    if (screenWidth > 900) {
      deviceType = "largeTablet";
    } else if (screenWidth > 600) {
      deviceType = "tablet";
    }

    const isPhone = deviceType === "phone";
    const isTablet = deviceType === "tablet" || deviceType === "largeTablet";
    const isLargeTablet = deviceType === "largeTablet";

    // Number of columns for grids
    const numColumns = isLargeTablet ? 3 : isTablet ? 2 : 1;

    // Grid gap scales with screen size
    const gridGap = isLargeTablet ? 16 : isTablet ? 12 : 8;

    // Responsive font sizes
    const fontScale = isLargeTablet ? 1.15 : isTablet ? 1.1 : 1;
    const fontSize = {
      xs: Math.round(10 * fontScale),
      sm: Math.round(12 * fontScale),
      md: Math.round(14 * fontScale),
      lg: Math.round(16 * fontScale),
      xl: Math.round(20 * fontScale),
      xxl: Math.round(24 * fontScale),
    };

    // Responsive spacing
    const spacingScale = isLargeTablet ? 1.25 : isTablet ? 1.15 : 1;
    const spacing = {
      xs: Math.round(4 * spacingScale),
      sm: Math.round(8 * spacingScale),
      md: Math.round(12 * spacingScale),
      lg: Math.round(16 * spacingScale),
      xl: Math.round(24 * spacingScale),
    };

    return {
      screenWidth,
      screenHeight,
      deviceType,
      isPhone,
      isTablet,
      isLargeTablet,
      isLandscape,
      numColumns,
      gridGap,
      fontSize,
      spacing,
    };
  }, [screenWidth, screenHeight]);
};

/**
 * Calculate item width for grid layouts
 */
export const getItemWidth = (
  screenWidth: number,
  numColumns: number,
  horizontalPadding: number,
  gap: number
): number => {
  const availableWidth = screenWidth - horizontalPadding * 2;
  return (availableWidth - gap * (numColumns - 1)) / numColumns;
};
