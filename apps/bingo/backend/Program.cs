using Bingo;
using Microsoft.AspNetCore.SignalR;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 16 * 1024);
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddOptions<BingoOptions>()
    .Bind(builder.Configuration.GetSection("Bingo"))
    .Validate(options => options.DisconnectGraceSeconds is >= 1 and <= 300, "La grâce doit être comprise entre 1 et 300 secondes.")
    .Validate(options => options.MaxLobbies is >= 1 and <= 2000, "La limite de lobbies doit être comprise entre 1 et 2000.")
    .ValidateOnStart();
builder.Services.AddSignalR(options =>
{
    options.MaximumReceiveMessageSize = 16 * 1024;
    options.MaximumParallelInvocationsPerClient = 1;
    options.EnableDetailedErrors = false;
    options.KeepAliveInterval = TimeSpan.FromSeconds(10);
    options.ClientTimeoutInterval = TimeSpan.FromSeconds(30);
    options.AddFilter<BingoHubFilter>();
});
builder.Services.AddSingleton<LobbyStore>();
builder.Services.AddHostedService<LobbyCleanup>();
var app = builder.Build();
app.MapGet("/bingo/api/health", () => Results.Ok(new { status = "ok" }));
app.MapHub<BingoHub>("/bingo/hub", options =>
{
    options.ApplicationMaxBufferSize = 64 * 1024;
    options.TransportMaxBufferSize = 64 * 1024;
});
app.Run();

public partial class Program;
