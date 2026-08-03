using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using PosSyncService.Models;

namespace PosSyncService;

public sealed class PosCashierRepository
{
    private readonly PosDbOptions _options;
    private readonly ILogger<PosCashierRepository> _logger;

    public PosCashierRepository(IOptions<PosDbOptions> options, ILogger<PosCashierRepository> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    private string ConnectionString => _options.GetEffectiveConnectionString();

    public async Task<int> InsertCashierAsync(
        string name,
        string username,
        string password,
        CancellationToken cancellationToken)
    {
        const string existsSql = @"
SELECT TOP 1 Id
FROM dbo.Users WITH (NOLOCK)
WHERE LOWER(LTRIM(RTRIM(UserName))) = LOWER(LTRIM(RTRIM(@UserName)));";

        const string insertSql = @"
DECLARE @NextId INT = (SELECT ISNULL(MAX(Id), 0) + 1 FROM dbo.Users WITH (UPDLOCK, HOLDLOCK));
INSERT INTO dbo.Users (
    Id,
    Name,
    FatherName,
    Phone,
    CNICNo,
    Address,
    Usertype,
    CardNo,
    UserName,
    Password,
    Designation,
    uploadstatus,
    branchid
)
VALUES (
    @NextId,
    @Name,
    '1',
    '1',
    '1',
    '1',
    'Cashier',
    NULL,
    @UserName,
    @Password,
    'Cashier',
    'Pending',
    0
);
SELECT @NextId;";

        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync(cancellationToken);

        await using (var existsCmd = new SqlCommand(existsSql, conn))
        {
            existsCmd.Parameters.AddWithValue("@UserName", username.Trim());
            var existing = await existsCmd.ExecuteScalarAsync(cancellationToken);
            if (existing is not null && existing != DBNull.Value)
            {
                throw new InvalidOperationException($"MintPOS username '{username}' already exists.");
            }
        }

        await using var cmd = new SqlCommand(insertSql, conn) { CommandType = CommandType.Text };
        cmd.Parameters.AddWithValue("@Name", name.Trim());
        cmd.Parameters.AddWithValue("@UserName", username.Trim());
        cmd.Parameters.AddWithValue("@Password", password);

        var result = await cmd.ExecuteScalarAsync(cancellationToken);
        var posUserId = Convert.ToInt32(result);
        _logger.LogInformation("Inserted MintPOS cashier {UserName} as user Id={PosUserId}", username, posUserId);
        return posUserId;
    }

    public async Task DeleteCashierAsync(int posUserId, CancellationToken cancellationToken)
    {
        const string deleteRightsSql = "DELETE FROM dbo.Rights WHERE Userid = @UserId;";
        const string deleteUserSql = "DELETE FROM dbo.Users WHERE Id = @UserId;";

        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync(cancellationToken);
        await using var tx = (SqlTransaction)await conn.BeginTransactionAsync(cancellationToken);

        try
        {
            await using (var rightsCmd = new SqlCommand(deleteRightsSql, conn, tx))
            {
                rightsCmd.Parameters.AddWithValue("@UserId", posUserId);
                var rightsDeleted = await rightsCmd.ExecuteNonQueryAsync(cancellationToken);
                _logger.LogInformation(
                    "Deleted {Count} Rights row(s) for MintPOS user Id={PosUserId}",
                    rightsDeleted,
                    posUserId);
            }

            await using (var userCmd = new SqlCommand(deleteUserSql, conn, tx))
            {
                userCmd.Parameters.AddWithValue("@UserId", posUserId);
                var usersDeleted = await userCmd.ExecuteNonQueryAsync(cancellationToken);
                if (usersDeleted == 0)
                {
                    throw new InvalidOperationException($"MintPOS user Id={posUserId} was not found.");
                }
            }

            await tx.CommitAsync(cancellationToken);
            _logger.LogInformation("Deleted MintPOS cashier Id={PosUserId}", posUserId);
        }
        catch
        {
            await tx.RollbackAsync(cancellationToken);
            throw;
        }
    }

    public async Task<IReadOnlyList<PosCashierRow>> ListCashiersAsync(CancellationToken cancellationToken)
    {
        const string sql = @"
SELECT
    u.Id AS PosUserId,
    LTRIM(RTRIM(u.Name)) AS Name,
    LTRIM(RTRIM(u.UserName)) AS UserName,
    LTRIM(RTRIM(u.Usertype)) AS UserType
FROM dbo.Users u WITH (NOLOCK)
WHERE LOWER(LTRIM(RTRIM(u.Usertype))) = 'cashier'
ORDER BY u.Id ASC;";

        var rows = new List<PosCashierRow>();
        await using var conn = new SqlConnection(ConnectionString);
        await conn.OpenAsync(cancellationToken);
        await using var cmd = new SqlCommand(sql, conn) { CommandType = CommandType.Text };
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var name = reader["Name"]?.ToString()?.Trim();
            var username = reader["UserName"]?.ToString()?.Trim();
            if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(username))
            {
                continue;
            }

            rows.Add(new PosCashierRow(
                PosUserId: Convert.ToInt32(reader["PosUserId"]),
                Name: name,
                Username: username,
                UserType: reader["UserType"]?.ToString()?.Trim() ?? "Cashier"
            ));
        }

        return rows;
    }
}

public sealed record PosCashierRow(
    int PosUserId,
    string Name,
    string Username,
    string UserType
);

public sealed record CashierSyncEvent(
    Guid Id,
    Guid? CashierId,
    string Action,
    CashierSyncPayload Payload
);

public sealed class CashierSyncPayload
{
    [System.Text.Json.Serialization.JsonPropertyName("name")]
    public string? Name { get; init; }

    [System.Text.Json.Serialization.JsonPropertyName("username")]
    public string? Username { get; init; }

    [System.Text.Json.Serialization.JsonPropertyName("password")]
    public string? Password { get; init; }

    [System.Text.Json.Serialization.JsonPropertyName("pos_user_id")]
    public int? PosUserId { get; init; }

    [System.Text.Json.Serialization.JsonPropertyName("user_type")]
    public string? UserType { get; init; }
}
