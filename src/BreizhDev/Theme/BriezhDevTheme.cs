using MudBlazor;

namespace BreizhDev.Theme;

public static class BreizhDevTheme
{
    public static MudTheme Create() => new()
    {
        PaletteLight = new PaletteLight
        {
            Background = "#FFFFFF",
            Surface = "#FFFFFF",
            TextPrimary = "#111111",
            TextSecondary = "#6B7280",
            Primary = "#7C3AED",
            PrimaryContrastText = "#FFFFFF",
            Secondary = "#10B981",
            SecondaryContrastText = "#FFFFFF",
            AppbarBackground = "#FFFFFF",
            AppbarText = "#111111",
            DrawerBackground = "#FFFFFF",
            DrawerText = "#111111",
            DrawerIcon = "#6B7280",
            Divider = "#E5E7EB",
            LinesDefault = "#E5E7EB",
            ActionDefault = "#6B7280",
            ActionDisabled = "#D1D5DB",
            TextDisabled = "#D1D5DB",
        },
        PaletteDark = new PaletteDark
        {
            Background = "#0A0A0A",
            Surface = "#141414",
            TextPrimary = "#FAFAFA",
            TextSecondary = "#A1A1AA",
            Primary = "#A78BFA",
            PrimaryContrastText = "#0A0A0A",
            Secondary = "#34D399",
            SecondaryContrastText = "#0A0A0A",
            AppbarBackground = "#0A0A0A",
            AppbarText = "#FAFAFA",
            DrawerBackground = "#141414",
            DrawerText = "#FAFAFA",
            DrawerIcon = "#A1A1AA",
            Divider = "#27272A",
            LinesDefault = "#27272A",
            ActionDefault = "#A1A1AA",
            ActionDisabled = "#3F3F46",
            TextDisabled = "#3F3F46",
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
                FontSize = "3rem",
                FontWeight = 700,
                LineHeight = 1.1,
                LetterSpacing = "-0.03em",
            },
            H2 = new H2
            {
                FontFamily = new[] { "Inter", "sans-serif" },
                FontSize = "2rem",
                FontWeight = 600,
                LineHeight = 1.2,
                LetterSpacing = "-0.02em",
            },
            H3 = new H3
            {
                FontFamily = new[] { "Inter", "sans-serif" },
                FontSize = "1.5rem",
                FontWeight = 600,
                LineHeight = 1.3,
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
                FontSize = "1.0625rem",
                FontWeight = 500,
                LineHeight = 1.5,
            },
            H6 = new H6
            {
                FontFamily = new[] { "Inter", "sans-serif" },
                FontSize = "0.9375rem",
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
