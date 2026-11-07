using System.Globalization;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Krampouezh;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Data.Sqlite;

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    WebRootPath = Path.Combine(AppContext.BaseDirectory, "wwwroot")
});
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 4096);
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.NumberHandling = JsonNumberHandling.Strict);
builder.Services.AddSingleton(_ => new LeaderboardStore(
    builder.Configuration["Leaderboard:DataPath"] ?? Path.Combine(builder.Environment.ContentRootPath, "data", "leaderboard.db")));
builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("submissions", limiter =>
    {
        limiter.PermitLimit = 30;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.QueueLimit = 0;
        limiter.AutoReplenishment = true;
    });
    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
            context.HttpContext.Response.Headers.RetryAfter = Math.Ceiling(retryAfter.TotalSeconds).ToString(CultureInfo.InvariantCulture);
        await context.HttpContext.Response.WriteAsJsonAsync(new { error = "Trop d'envois. Réessaie dans une minute." }, cancellationToken);
    };
});
var app = builder.Build();
// Fail startup on inaccessible or corrupt storage instead of silently discarding scores.
app.Services.GetRequiredService<LeaderboardStore>();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRateLimiter();

app.MapGet("/api/leaderboard", (Guid? id, LeaderboardStore store, HttpContext context, ILogger<Program> logger) =>
{
    context.Response.Headers.CacheControl = "no-store";
    if (id == Guid.Empty) return Results.BadRequest(new { error = "Identifiant de partie invalide." });
    try { return Results.Ok(store.Read(id)); }
    catch (Exception error) when (error is SqliteException or IOException or UnauthorizedAccessException)
    {
        logger.LogError(error, "Unable to read leaderboard storage.");
        return Results.Json(new { error = "Classement indisponible pour le moment." }, statusCode: 503);
    }
});

app.MapPost("/api/leaderboard", (ScoreSubmission submission, LeaderboardStore store, HttpContext context, ILogger<Program> logger) =>
{
    context.Response.Headers.CacheControl = "no-store";
    if (!ScoreValidation.TryNormalize(submission, out _))
        return Results.BadRequest(new { error = "Indique un pseudo de 2 à 20 caractères et un score entre 1 et 1 000 000." });
    try { return Results.Ok(store.Submit(submission)); }
    catch (ScoreConflictException)
    {
        return Results.Conflict(new { error = "Cette partie a déjà été enregistrée avec un autre score ou pseudo." });
    }
    catch (Exception error) when (error is SqliteException or IOException or UnauthorizedAccessException)
    {
        logger.LogError(error, "Unable to save leaderboard score.");
        return Results.Json(new { error = "Classement indisponible pour le moment." }, statusCode: 503);
    }
}).RequireRateLimiting("submissions");

app.Run();
public partial class Program;
