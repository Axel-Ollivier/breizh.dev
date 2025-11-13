FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY src/BreizhDev/BreizhDev.csproj src/BreizhDev/
RUN dotnet restore src/BreizhDev/BreizhDev.csproj

COPY src/BreizhDev/ src/BreizhDev/
RUN dotnet publish src/BreizhDev -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production

COPY --from=build /app .

EXPOSE 8080

ENTRYPOINT ["dotnet", "BreizhDev.dll"]
