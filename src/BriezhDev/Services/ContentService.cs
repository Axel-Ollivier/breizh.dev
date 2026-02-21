using System.Text.Json;
using System.Text.RegularExpressions;
using BriezhDev.Models;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

namespace BriezhDev.Services;

public partial class ContentService
{
    private readonly MarkdownService _markdownService;
    private readonly string _contentPath;
    private List<Article>? _articlesCache;
    private List<Project>? _projectsCache;

    public ContentService(MarkdownService markdownService, IWebHostEnvironment env)
    {
        _markdownService = markdownService;
        _contentPath = Path.Combine(env.ContentRootPath, "Content");
    }

    public async Task<List<Article>> GetArticlesAsync()
    {
        if (_articlesCache is not null)
            return _articlesCache;

        var articles = new List<Article>();
        var articlesPath = Path.Combine(_contentPath, "articles");

        if (!Directory.Exists(articlesPath))
            return articles;

        foreach (var file in Directory.GetFiles(articlesPath, "*.md"))
        {
            var article = await ParseArticleAsync(file);
            if (article is not null)
                articles.Add(article);
        }

        _articlesCache = articles.OrderByDescending(a => a.Date).ToList();
        return _articlesCache;
    }

    public async Task<Article?> GetArticleBySlugAsync(string slug)
    {
        var articles = await GetArticlesAsync();
        return articles.FirstOrDefault(a => a.Slug == slug);
    }

    public async Task<List<Project>> GetProjectsAsync()
    {
        if (_projectsCache is not null)
            return _projectsCache;

        var projectsFile = Path.Combine(_contentPath, "projects", "projects.json");

        if (!File.Exists(projectsFile))
            return [];

        var json = await File.ReadAllTextAsync(projectsFile);
        var projects = JsonSerializer.Deserialize<List<Project>>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        }) ?? [];

        _projectsCache = projects;
        return _projectsCache;
    }

    public async Task<Project?> GetProjectBySlugAsync(string slug)
    {
        var projects = await GetProjectsAsync();
        return projects.FirstOrDefault(p => p.Slug == slug);
    }

    public async Task<List<string>> GetAllTagsAsync()
    {
        var articles = await GetArticlesAsync();
        var projects = await GetProjectsAsync();

        return articles.SelectMany(a => a.Tags)
            .Concat(projects.SelectMany(p => p.Tags))
            .Distinct()
            .OrderBy(t => t)
            .ToList();
    }

    private async Task<Article?> ParseArticleAsync(string filePath)
    {
        var content = await File.ReadAllTextAsync(filePath);
        var frontMatterMatch = FrontMatterRegex().Match(content);

        if (!frontMatterMatch.Success)
            return null;

        var yamlContent = frontMatterMatch.Groups[1].Value;
        var markdownContent = content[frontMatterMatch.Length..].Trim();

        var deserializer = new DeserializerBuilder()
            .WithNamingConvention(CamelCaseNamingConvention.Instance)
            .Build();

        var frontMatter = deserializer.Deserialize<ArticleFrontMatter>(yamlContent);

        return new Article
        {
            Slug = Path.GetFileNameWithoutExtension(filePath),
            Title = frontMatter.Title ?? string.Empty,
            Date = frontMatter.Date,
            Tags = frontMatter.Tags ?? [],
            Summary = frontMatter.Summary ?? string.Empty,
            Content = markdownContent,
            HtmlContent = _markdownService.ToHtml(markdownContent),
        };
    }

    [GeneratedRegex(@"^---\s*\n(.*?)\n---\s*\n", RegexOptions.Singleline)]
    private static partial Regex FrontMatterRegex();

    private class ArticleFrontMatter
    {
        public string? Title { get; set; }
        public DateTime Date { get; set; }
        public List<string>? Tags { get; set; }
        public string? Summary { get; set; }
    }
}
