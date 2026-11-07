# syntax=docker/dockerfile:1
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY server/Krampouezh.csproj server/
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then \
      SSL_CERT_FILE=/run/secrets/proxy_ca dotnet restore server/Krampouezh.csproj; \
    else \
      dotnet restore server/Krampouezh.csproj; \
    fi
COPY server/ server/
COPY index.html ./
RUN dotnet publish server/Krampouezh.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app/publish ./
RUN chmod -R a+rX /app && mkdir -p /app/data && chown app:app /app/data
ENV ASPNETCORE_HTTP_PORTS=8080 \
    Leaderboard__DataPath=/app/data/leaderboard.db
USER app

EXPOSE 8080
ENTRYPOINT ["dotnet", "Krampouezh.dll"]
