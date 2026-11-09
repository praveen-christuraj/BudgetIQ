import {
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import FileDownloadRoundedIcon from '@mui/icons-material/FileDownloadRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';

import { useAuth } from '@/app/providers/AuthContext';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useFeedback } from '@/components/common/FeedbackProvider';
import { MoneyText } from '@/components/common/MoneyText';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/StateBlocks';
import { ScopeChip, TransactionStatusChip } from '@/components/common/StatusChip';
import {
  accountsApi,
  categoriesApi,
  membersApi,
  settingsApi,
  transactionsApi,
} from '@/services/endpoints';
import type { DuplicateWarning, Transaction, TransactionFilters } from '@/types';
import { formatDate, formatMoney } from '@/utils/format';
import { invalidateFinancialData } from '@/utils/invalidate';
import { humanize } from '@/utils/format';

import { ReceiptDialog } from './ReceiptDialog';
import { TransactionDialog, type TransactionFormValues } from './TransactionDialog';

type PageKind = 'income' | 'expense' | 'all';

const TITLES: Record<PageKind, { title: string; subtitle: string }> = {
  income: { title: 'Income', subtitle: 'Every rupee that came in — salary, business, interest and more.' },
  expense: { title: 'Expenses', subtitle: 'Household and personal spending with categories, receipts and approval-free entry.' },
  all: { title: 'Transactions', subtitle: 'Complete register of income and expenses.' },
};

interface Filters {
  q: string;
  scope: '' | 'shared' | 'personal';
  status: '' | 'draft' | 'posted' | 'reversed';
  member_id: string;
  account_id: string;
  category_id: string;
  date_from: string;
  date_to: string;
  sort: string;
  page: number;
  page_size: number;
}

const initialFilters: Filters = {
  q: '',
  scope: '',
  status: '',
  member_id: '',
  account_id: '',
  category_id: '',
  date_from: '',
  date_to: '',
  sort: 'date_desc',
  page: 0,
  page_size: 20,
};

export function TransactionsPage({ kind }: { kind: PageKind }) {
  const { context, isAdmin } = useAuth();
  const { notify } = useFeedback();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [reversing, setReversing] = useState<Transaction | null>(null);
  const [receiptFor, setReceiptFor] = useState<Transaction | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<{ transaction: Transaction; warnings: DuplicateWarning[] } | null>(null);

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: () => accountsApi.list() });
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: () => categoriesApi.list(undefined, false) });
  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: membersApi.list });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const symbol = settings?.currency_symbol ?? '₹';

  const queryFilters: TransactionFilters = useMemo(
    () => ({
      q: filters.q || undefined,
      transaction_type: kind === 'all' ? undefined : kind,
      scope: filters.scope || undefined,
      status: filters.status || undefined,
      member_id: filters.member_id || undefined,
      account_id: filters.account_id || undefined,
      category_id: filters.category_id || undefined,
      date_from: filters.date_from || undefined,
      date_to: filters.date_to || undefined,
      sort: filters.sort,
      page: filters.page + 1,
      page_size: filters.page_size,
    }),
    [filters, kind],
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['transactions', queryFilters],
    queryFn: () => transactionsApi.list(queryFilters),
  });

  const createMutation = useMutation({
    mutationFn: (values: TransactionFormValues) => transactionsApi.create({ ...values }),
    onSuccess: async (result) => {
      await invalidateFinancialData(queryClient);
      setDialogOpen(false);
      if (result.duplicate_warnings.length) {
        setDuplicateInfo({ transaction: result.transaction, warnings: result.duplicate_warnings });
      } else {
        notify(`${result.transaction.transaction_type === 'income' ? 'Income' : 'Expense'} recorded`);
      }
    },
    onError: (err: Error) => notify(err.message, 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: (values: TransactionFormValues) => transactionsApi.update(editing!.id, { ...values }),
    onSuccess: async () => {
      await invalidateFinancialData(queryClient);
      setDialogOpen(false);
      setEditing(null);
      notify('Transaction updated and audited');
    },
    onError: (err: Error) => notify(err.message, 'error'),
  });

  const reverseMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => transactionsApi.reverse(id, reason),
    onSuccess: async () => {
      await invalidateFinancialData(queryClient);
      setReversing(null);
      notify('Transaction reversed. Balances and reports were restored.');
    },
    onError: (err: Error) => notify(err.message, 'error'),
  });

  const filteredCategories = categories.filter((category) => kind === 'all' || category.kind === kind);
  const page = data;

  const resetFilters = () => setFilters(initialFilters);

  return (
    <>
      <PageHeader
        title={TITLES[kind].title}
        subtitle={TITLES[kind].subtitle}
        actions={
          <>
            <Button
              variant="outlined"
              startIcon={<FileDownloadRoundedIcon />}
              onClick={() =>
                void transactionsApi
                  .export({ ...queryFilters, page: undefined, page_size: undefined })
                  .then(() => notify('Excel export downloaded'))
                  .catch((err: Error) => notify(err.message, 'error'))
              }
            >
              Export Excel
            </Button>
            <Button
              variant="contained"
              startIcon={<AddRoundedIcon />}
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              Add {kind === 'income' ? 'income' : kind === 'expense' ? 'expense' : 'transaction'}
            </Button>
          </>
        }
      />

      <Card sx={{ mb: 2, p: 2 }}>
        <Grid container spacing={1.5}>
          <Grid item xs={12} md={4}>
            <TextField
              placeholder="Search description or notes"
              value={filters.q}
              onChange={(event) => setFilters((previous) => ({ ...previous, q: event.target.value, page: 0 }))}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRoundedIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <TextField
              select
              label="Scope"
              value={filters.scope}
              onChange={(event) => setFilters((previous) => ({ ...previous, scope: event.target.value as Filters['scope'], page: 0 }))}
            >
              <MenuItem value="">All scopes</MenuItem>
              <MenuItem value="shared">Shared</MenuItem>
              <MenuItem value="personal">Personal</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <TextField
              select
              label="Status"
              value={filters.status}
              onChange={(event) => setFilters((previous) => ({ ...previous, status: event.target.value as Filters['status'], page: 0 }))}
            >
              <MenuItem value="">Posted & drafts</MenuItem>
              <MenuItem value="posted">Posted</MenuItem>
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="reversed">Reversed</MenuItem>
            </TextField>
          </Grid>
          {isAdmin && (
            <Grid item xs={6} sm={4} md={2}>
              <TextField
                select
                label="Member"
                value={filters.member_id}
                onChange={(event) => setFilters((previous) => ({ ...previous, member_id: event.target.value, page: 0 }))}
              >
                <MenuItem value="">Everyone</MenuItem>
                {members.map((member) => (
                  <MenuItem key={member.user_id} value={member.user_id}>
                    {member.full_name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          )}
          <Grid item xs={6} sm={4} md={2}>
            <TextField
              select
              label="Account"
              value={filters.account_id}
              onChange={(event) => setFilters((previous) => ({ ...previous, account_id: event.target.value, page: 0 }))}
            >
              <MenuItem value="">All accounts</MenuItem>
              {accounts.map((account) => (
                <MenuItem key={account.id} value={account.id}>
                  {account.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <TextField
              select
              label="Category"
              value={filters.category_id}
              onChange={(event) => setFilters((previous) => ({ ...previous, category_id: event.target.value, page: 0 }))}
            >
              <MenuItem value="">All categories</MenuItem>
              {filteredCategories.map((category) => (
                <MenuItem key={category.id} value={category.id}>
                  {category.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <TextField
              label="From"
              type="date"
              value={filters.date_from}
              onChange={(event) => setFilters((previous) => ({ ...previous, date_from: event.target.value, page: 0 }))}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <TextField
              label="To"
              type="date"
              value={filters.date_to}
              onChange={(event) => setFilters((previous) => ({ ...previous, date_to: event.target.value, page: 0 }))}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} md="auto" sx={{ display: 'flex', alignItems: 'center' }}>
            <Button color="inherit" onClick={resetFilters} size="small">
              Clear filters
            </Button>
          </Grid>
        </Grid>
      </Card>

      <Card>
        {isLoading ? (
          <LoadingBlock label="Loading transactions…" minHeight={300} />
        ) : isError ? (
          <ErrorState message={(error as Error)?.message ?? 'Unable to load transactions'} onRetry={() => void refetch()} />
        ) : page?.items.length ? (
          <>
            <TableContainer>
              <Table size="small" sx={{ minWidth: 900 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell>Account</TableCell>
                    {kind === 'all' && <TableCell>Type</TableCell>}
                    <TableCell align="right">Amount</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {page.items.map((transaction) => (
                    <TableRow key={transaction.id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(transaction.transaction_date)}</TableCell>
                      <TableCell sx={{ maxWidth: 260 }}>
                        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                          <Typography variant="body2" fontWeight={600} component="span">
                            {transaction.description}
                          </Typography>
                          <ScopeChip scope={transaction.scope} />
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {transaction.owner_name ?? 'Household'} · {humanize(transaction.payment_method)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: transaction.category_name ? 'primary.main' : 'grey.400' }} />
                          <Box>
                            <Typography variant="body2">{transaction.category_name ?? 'Uncategorised'}</Typography>
                            {transaction.subcategory_name && (
                              <Typography variant="caption" color="text.secondary">
                                {transaction.subcategory_name}
                              </Typography>
                            )}
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{transaction.account_name}</Typography>
                      </TableCell>
                      {kind === 'all' && (
                        <TableCell>
                          <Chip
                            size="small"
                            label={transaction.transaction_type === 'income' ? 'Income' : 'Expense'}
                            color={transaction.transaction_type === 'income' ? 'success' : 'error'}
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.65rem' }}
                          />
                        </TableCell>
                      )}
                      <TableCell align="right">
                        <MoneyText
                          value={transaction.transaction_type === 'income' ? transaction.amount : -transaction.amount}
                          symbol={symbol}
                          signed
                          tone={transaction.transaction_type === 'income' ? 'positive' : 'negative'}
                          variant="body2"
                          fontWeight={700}
                        />
                      </TableCell>
                      <TableCell>
                        <TransactionStatusChip status={transaction.status} />
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" justifyContent="flex-end" spacing={0}>
                          <Tooltip title="Receipts">
                            <IconButton size="small" onClick={() => setReceiptFor(transaction)} aria-label="Receipts">
                              <ReceiptLongRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {transaction.is_editable && (
                            <Tooltip title="Edit">
                              <IconButton
                                size="small"
                                aria-label="Edit"
                                onClick={() => {
                                  setEditing(transaction);
                                  setDialogOpen(true);
                                }}
                              >
                                <EditRoundedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {transaction.is_editable && (
                            <Tooltip title="Reverse (soft delete)">
                              <IconButton size="small" color="error" aria-label="Reverse" onClick={() => setReversing(transaction)}>
                                <DeleteOutlineRoundedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={page.total}
              page={filters.page}
              rowsPerPage={filters.page_size}
              rowsPerPageOptions={[10, 20, 50, 100]}
              onPageChange={(_event, nextPage) => setFilters((previous) => ({ ...previous, page: nextPage }))}
              onRowsPerPageChange={(event) =>
                setFilters((previous) => ({ ...previous, page_size: Number(event.target.value), page: 0 }))
              }
            />
          </>
        ) : (
          <EmptyState
            title="No transactions match these filters"
            description="Try widening the date range, clearing filters, or record a new entry."
            icon={<ReceiptLongRoundedIcon fontSize="inherit" />}
            action={
              <Button variant="contained" size="small" startIcon={<AddRoundedIcon />} onClick={() => setDialogOpen(true)}>
                Record {kind === 'income' ? 'income' : 'an expense'}
              </Button>
            }
          />
        )}
      </Card>

      <TransactionDialog
        open={dialogOpen}
        mode={editing ? 'edit' : 'create'}
        defaultType={kind === 'income' ? 'income' : 'expense'}
        transaction={editing}
        accounts={accounts}
        categories={categories}
        members={members}
        isAdmin={isAdmin}
        currentUserId={context?.user.id}
        loading={createMutation.isPending || updateMutation.isPending}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
        onSubmit={(values) => {
          if (editing) updateMutation.mutate(values);
          else createMutation.mutate(values);
        }}
      />

      <ConfirmDialog
        open={Boolean(reversing)}
        title="Reverse this transaction?"
        description={
          reversing
            ? `"${reversing.description}" of ${formatMoney(reversing.amount, { symbol })} will stay in the audit history, but will no longer count towards balances, budgets or reports.`
            : ''
        }
        confirmLabel="Reverse transaction"
        tone="error"
        requireReason
        loading={reverseMutation.isPending}
        onClose={() => setReversing(null)}
        onConfirm={(reason) => reversing && reverseMutation.mutate({ id: reversing.id, reason })}
      />

      <ReceiptDialog open={Boolean(receiptFor)} transaction={receiptFor} onClose={() => setReceiptFor(null)} />

      <Dialog open={Boolean(duplicateInfo)} onClose={() => setDuplicateInfo(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <WarningAmberRoundedIcon color="warning" />
            Possible duplicate detected
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The transaction was saved, but a similar one already exists. Review the entries below and reverse the
            new record if it was entered twice.
          </Typography>
          {duplicateInfo?.warnings.map((warning) => (
            <Card key={warning.transaction_id} variant="outlined" sx={{ p: 1.5, mb: 1 }}>
              <Stack direction="row" justifyContent="space-between" spacing={1}>
                <Box>
                  <Typography variant="body2" fontWeight={600}>
                    {warning.description}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Existing record · {formatDate(warning.transaction_date)}
                  </Typography>
                </Box>
                <MoneyText value={warning.amount} symbol={symbol} variant="body2" fontWeight={700} />
              </Stack>
            </Card>
          ))}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDuplicateInfo(null)}>Keep both</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              if (!duplicateInfo) return;
              setReversing(duplicateInfo.transaction);
              setDuplicateInfo(null);
            }}
          >
            Reverse the new entry
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
