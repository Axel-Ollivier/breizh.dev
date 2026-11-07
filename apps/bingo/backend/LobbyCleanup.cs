namespace Bingo;

public sealed class LobbyCleanup(LobbyStore store, ILogger<LobbyCleanup> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                try { await store.CleanupAsync(); }
                catch (Exception error) when (!stoppingToken.IsCancellationRequested)
                {
                    logger.LogError(error, "Le nettoyage des lobbies a échoué ; nouvelle tentative au prochain passage.");
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }
}
