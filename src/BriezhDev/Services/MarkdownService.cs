using Markdig;

namespace BriezhDev.Services;

public class MarkdownService
{
    private readonly MarkdownPipeline _pipeline;

    public MarkdownService()
    {
        _pipeline = new MarkdownPipelineBuilder()
            .UseAdvancedExtensions()
            .UseYamlFrontMatter()
            .Build();
    }

    public string ToHtml(string markdown)
    {
        return Markdown.ToHtml(markdown, _pipeline);
    }
}
