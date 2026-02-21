using MudBlazor;

namespace BriezhDev.Theme;

public static class BriezhDevTheme
{
    public static MudTheme Create() => new()
    {
        PaletteLight = new PaletteLight
        {
            Background = "#FFFFFF",
            Surface = "#F5F5F5",
            TextPrimary = "#0A0A0A",
            TextSecondary = "#6B7280",
            Primary = "#7C3AED",
            PrimaryContrastText = "#FFFFFF",
            Secondary = "#10B981",
            SecondaryContrastText = "#FFFFFF",
            AppbarBackground = "#FFFFFF",
            AppbarText = "#0A0A0A",
            DrawerBackground = "#FFFFFF",
            DrawerText = "#0A0A0A",
            DrawerIcon = "#6B7280",
            Divider = "#E5E7EB",
            LinesDefault = "#E5E7EB",
            ActionDefault = "#6B7280",
            ActionDisabled = "#9CA3AF",
            TextDisabled = "#9CA3AF",
        },
        PaletteDark = new PaletteDark
        {
            Background = "#0A0A0A",
            Surface = "#141414",
            TextPrimary = "#F5F5F5",
            TextSecondary = "#9CA3AF",
            Primary = "#A78BFA",
            PrimaryContrastText = "#0A0A0A",
            Secondary = "#34D399",
            SecondaryContrastText = "#0A0A0A",
            AppbarBackground = "#0A0A0A",
            AppbarText = "#F5F5F5",
            DrawerBackground = "#0A0A0A",
            DrawerText = "#F5F5F5",
            DrawerIcon = "#9CA3AF",
            Divider = "#2D2D2D",
            LinesDefault = "#2D2D2D",
            ActionDefault = "#9CA3AF",
            ActionDisabled = "#6B7280",
            TextDisabled = "#6B7280",
        },
        Typography = new Typography
        {
            Default = new Default
            {
                FontFamily = new[] { "Inter", "sans-serif" },
                FontSize = "0.9375rem",
                FontWeight = 400,
                LineHeight = 1.6,
            },
            H1 = new H1
            {
                FontFamily = new[] { "Inter", "sans-serif" },
                FontSize = "2.5rem",
                FontWeight = 700,
                LineHeight = 1.2,
            },
            H2 = new H2
            {
                FontFamily = new[] { "Inter", "sans-serif" },
                FontSize = "2rem",
                FontWeight = 600,
                LineHeight = 1.3,
            },
            H3 = new H3
            {
                FontFamily = new[] { "Inter", "sans-serif" },
                FontSize = "1.5rem",
                FontWeight = 600,
                LineHeight = 1.4,
            },
            H4 = new H4
            {
                FontFamily = new[] { "Inter", "sans-serif" },
                FontSize = "1.25rem",
                FontWeight = 600,
                LineHeight = 1.4,
            },
            H5 = new H5
            {
                FontFamily = new[] { "Inter", "sans-serif" },
                FontSize = "1.125rem",
                FontWeight = 500,
                LineHeight = 1.5,
            },
            H6 = new H6
            {
                FontFamily = new[] { "Inter", "sans-serif" },
                FontSize = "1rem",
                FontWeight = 500,
                LineHeight = 1.5,
            },
            Body1 = new Body1
            {
                FontFamily = new[] { "Inter", "sans-serif" },
                FontSize = "1rem",
                FontWeight = 400,
                LineHeight = 1.7,
            },
            Body2 = new Body2
            {
                FontFamily = new[] { "Inter", "sans-serif" },
                FontSize = "0.875rem",
                FontWeight = 400,
                LineHeight = 1.6,
            },
            Subtitle1 = new Subtitle1
            {
                FontFamily = new[] { "Inter", "sans-serif" },
                FontSize = "1rem",
                FontWeight = 500,
                LineHeight = 1.5,
            },
            Subtitle2 = new Subtitle2
            {
                FontFamily = new[] { "Inter", "sans-serif" },
                FontSize = "0.875rem",
                FontWeight = 500,
                LineHeight = 1.5,
            },
        },
        LayoutProperties = new LayoutProperties
        {
            DefaultBorderRadius = "8px",
        },
    };
}
