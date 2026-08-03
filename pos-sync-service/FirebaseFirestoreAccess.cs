using System.IO;
using Google.Apis.Auth.OAuth2;
using Google.Cloud.Firestore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using PosSyncService.Models;

namespace PosSyncService;

public sealed class FirebaseFirestoreAccess
{
    private readonly ILogger<FirebaseFirestoreAccess> _logger;

    public FirebaseFirestoreAccess(
        IOptions<FirebaseOptions> options,
        ILogger<FirebaseFirestoreAccess> logger)
    {
        _logger = logger;
        var config = options.Value;
        if (string.IsNullOrWhiteSpace(config.ProjectId))
        {
            throw new InvalidOperationException("Firebase:ProjectId is required");
        }

        var credentialsPath = config.CredentialsPath?.Trim();
        if (!string.IsNullOrWhiteSpace(credentialsPath) && File.Exists(credentialsPath))
        {
            var credential = GoogleCredential.FromFile(credentialsPath);
            Database = new FirestoreDbBuilder
            {
                ProjectId = config.ProjectId,
                Credential = credential
            }.Build();
            _logger.LogInformation(
                "Firebase Firestore initialized for project {ProjectId} using credentials file.",
                config.ProjectId);
            return;
        }

        Database = FirestoreDb.Create(config.ProjectId);
        _logger.LogInformation(
            "Firebase Firestore initialized for project {ProjectId} using application default credentials.",
            config.ProjectId);
    }

    public FirestoreDb Database { get; }
}
