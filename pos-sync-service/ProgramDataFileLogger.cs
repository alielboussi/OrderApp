using System;
using System.IO;
using Microsoft.Extensions.Logging;

namespace PosSyncService;

internal static class ProgramDataLogWriter
{
    private static readonly object WriteLock = new();
    private static string? _logPath;

    public static string? LogPath => _logPath;

    public static void Initialize(string configRoot)
    {
        var root = string.IsNullOrWhiteSpace(configRoot) ? AppContext.BaseDirectory : configRoot;
        Directory.CreateDirectory(root);
        _logPath = Path.Combine(root, "log.txt");
    }

    public static void Write(LogLevel level, string category, string message, Exception? exception = null)
    {
        if (string.IsNullOrWhiteSpace(_logPath))
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(message) && exception is null)
        {
            return;
        }

        var prefix = level >= LogLevel.Error ? "ERROR" : level.ToString().ToUpperInvariant();
        var line = $"{DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss.fff zzz} [{ShortCategory(category)}] [{prefix}] {message}";
        if (exception is not null)
        {
            line += Environment.NewLine + exception;
        }

        lock (WriteLock)
        {
            File.AppendAllText(_logPath, line + Environment.NewLine);
        }
    }

    private static string ShortCategory(string category)
    {
        const string prefix = "PosSyncService.";
        return category.StartsWith(prefix, StringComparison.Ordinal)
            ? category[prefix.Length..]
            : category;
    }
}

public sealed class ProgramDataFileLoggerProvider : ILoggerProvider
{
    private readonly LogLevel _minLevel;

    public ProgramDataFileLoggerProvider(string configRoot, LogLevel minLevel = LogLevel.Debug)
    {
        ProgramDataLogWriter.Initialize(configRoot);
        _minLevel = minLevel;
    }

    public ILogger CreateLogger(string categoryName) =>
        new ProgramDataFileLogger(categoryName, _minLevel);

    public void Dispose()
    {
    }

    private sealed class ProgramDataFileLogger : ILogger
    {
        private readonly string _category;
        private readonly LogLevel _minLevel;

        public ProgramDataFileLogger(string category, LogLevel minLevel)
        {
            _category = category;
            _minLevel = minLevel;
        }

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => logLevel >= _minLevel;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel))
            {
                return;
            }

            ProgramDataLogWriter.Write(logLevel, _category, formatter(state, exception), exception);
        }
    }
}
