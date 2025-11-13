using System.Text.Json;
using BreizhDev.Models;

namespace BreizhDev.Services;

public class ContentService
{
    private readonly string _contentPath;
    private List<Project>? _projectsCache;

    public ContentService(IWebHostEnvironment env)
    {
        _contentPath = Path.Combine(env.ContentRootPath, "Content");
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
}
