import {
  Box,
  Button,
  Card,
  Chip,
  Collapse,
  Grid,
  IconButton,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';

import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/StateBlocks';
import { auditApi } from '@/services/endpoints';
import { formatDateTime } from '@/utils/format';

export function AuditPage() {
  const [filters, setFilters] = useState({ action: '', entity_type: '', q: '', date_from: '', date_to: '' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: actions = [] } = useQuery({ queryKey: ['audit', 'actions'], queryFn: auditApi.actions });
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['audit', 'list', filters, page, pageSize],
    queryFn: () =>
      auditApi.list({
        action: filters.action || undefined,
        entity_type: filters.entity_type || undefined,
        q: filters.q || undefined,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
        page: page + 1,
        page_size: pageSize,
      }),
  });

  return (
    <>
      <PageHeader
        title="Audit history"
        subtitle="Immutable record of who created, modified, reversed or deleted financial data — and when."
      />

      <Card sx={{ mb: 2, p: 2 }}>
        <Grid container spacing={1.5}>
          <Grid item xs={12} md={3}>
            <TextField
              label="Search"
              placeholder="Actor, summary or action"
              value={filters.q}
              onChange={(event) => {
                setFilters({ ...filters, q: event.target.value });
                setPage(0);
              }}
            />
          </Grid>
          <Grid item xs={6} md={2.5}>
            <TextField
              select
              label="Action"
              value={filters.action}
              onChange={(event) => {
                setFilters({ ...filters, action: event.target.value });
                setPage(0);
              }}
            >
              <MenuItem value="">All actions</MenuItem>
              {actions.map((action) => (
                <MenuItem key={action} value={action}>
                  {action}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField
              select
              label="Entity"
              value={filters.entity_type}
              onChange={(event) => {
                setFilters({ ...filters, entity_type: event.target.value });
                setPage(0);
              }}
            >
              <MenuItem value="">All entities</MenuItem>
              {['transaction', 'transfer', 'account', 'budget', 'category', 'member', 'loan', 'savings_goal', 'recurring_rule', 'user', 'household_settings'].map((entity) => (
                <MenuItem key={entity} value={entity}>
                  {entity.replace('_', ' ')}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField
              label="From"
              type="date"
              value={filters.date_from}
              onChange={(event) => {
                setFilters({ ...filters, date_from: event.target.value });
                setPage(0);
              }}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField
              label="To"
              type="date"
              value={filters.date_to}
              onChange={(event) => {
                setFilters({ ...filters, date_to: event.target.value });
                setPage(0);
              }}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} md={0.5} sx={{ display: 'flex', alignItems: 'center' }}>
            <Button size="small" color="inherit" onClick={() => setFilters({ action: '', entity_type: '', q: '', date_from: '', date_to: '' })}>
              Clear
            </Button>
          </Grid>
        </Grid>
      </Card>

      <Card>
        {isLoading ? (
          <LoadingBlock label="Loading audit history…" />
        ) : isError ? (
          <ErrorState message={(error as Error)?.message ?? 'Unable to load audit history'} onRetry={() => void refetch()} />
        ) : data?.items.length ? (
          <>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell />
                  <TableCell>When</TableCell>
                  <TableCell>Actor</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Entity</TableCell>
                  <TableCell>Summary</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.items.map((entry) => (
                  <Fragment key={entry.id}>
                    <TableRow hover>
                      <TableCell sx={{ width: 40 }}>
                        <IconButton size="small" onClick={() => setExpanded(expanded === entry.id ? null : entry.id)} aria-label="Toggle details">
                          {expanded === entry.id ? <ExpandLessRoundedIcon fontSize="small" /> : <ExpandMoreRoundedIcon fontSize="small" />}
                        </IconButton>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(entry.created_at)}</TableCell>
                      <TableCell>{entry.actor_name}</TableCell>
                      <TableCell>
                        <Chip size="small" variant="outlined" label={entry.action} sx={{ fontSize: '0.65rem' }} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {entry.entity_type}
                        </Typography>
                      </TableCell>
                      <TableCell>{entry.summary}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={6} sx={{ py: 0, borderBottom: expanded === entry.id ? undefined : 'none' }}>
                        <Collapse in={expanded === entry.id} timeout="auto" unmountOnExit>
                          <Box sx={{ py: 2 }}>
                            <Grid container spacing={2}>
                              <Grid item xs={12} md={6}>
                                <Typography variant="caption" fontWeight={700} color="text.secondary">
                                  Before
                                </Typography>
                                <Box component="pre" sx={{ fontSize: '0.72rem', backgroundColor: '#F7F9F8', p: 1.5, borderRadius: 1.5, overflowX: 'auto', m: 0 }}>
                                  {entry.before_json ? JSON.stringify(JSON.parse(entry.before_json), null, 2) : '—'}
                                </Box>
                              </Grid>
                              <Grid item xs={12} md={6}>
                                <Typography variant="caption" fontWeight={700} color="text.secondary">
                                  After
                                </Typography>
                                <Box component="pre" sx={{ fontSize: '0.72rem', backgroundColor: '#F7F9F8', p: 1.5, borderRadius: 1.5, overflowX: 'auto', m: 0 }}>
                                  {entry.after_json ? JSON.stringify(JSON.parse(entry.after_json), null, 2) : '—'}
                                </Box>
                              </Grid>
                              <Grid item xs={12}>
                                <Typography variant="caption" color="text.disabled">
                                  Entry ID {entry.id} · Entity ID {entry.entity_id ?? '—'} · IP {entry.ip_address ?? 'local'}
                                </Typography>
                              </Grid>
                            </Grid>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                ))}
              </TableBody>
            </Table>
            <TablePagination
              component="div"
              count={data.total}
              page={page}
              rowsPerPage={pageSize}
              rowsPerPageOptions={[25, 50, 100, 200]}
              onPageChange={(_event, next) => setPage(next)}
              onRowsPerPageChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(0);
              }}
            />
          </>
        ) : (
          <EmptyState title="No audit records match these filters" icon={<HistoryRoundedIcon fontSize="inherit" />} />
        )}
      </Card>
    </>
  );
}
