namespace BreizhDev.Models;

public class Project
{
    public string Slug { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public List<string> Tags { get; set; } = [];
    public string? GitHubUrl { get; set; }
    public string? DemoUrl { get; set; }
    public string? ImageUrl { get; set; }
    public string? Content { get; set; }
    public string? HtmlContent { get; set; }
}
